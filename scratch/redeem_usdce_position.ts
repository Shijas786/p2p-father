import { polymarketRelayerService } from "../src/services/relayer";
import { wallet as walletService } from "../src/services/wallet";
import { RelayClient } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const CTF_ADAPTER = "0xADa100874d00e3331D00F2007a9c336a65009718"; // Old adapter for USDC.e
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    const userIndex = 0;
    const depositWallet = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

    const derived = walletService.deriveWallet(userIndex);
    const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
    const wallet = createWalletClient({
        account,
        transport: http(POLYGON_RPC)
    });

    const creds = {
        key: process.env.POLYMARKET_BUILDER_API_KEY || "",
        secret: process.env.POLYMARKET_BUILDER_SECRET || "",
        passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE || ""
    };

    const builderConfig = new BuilderConfig({
        localBuilderCreds: creds
    });

    const relayerUrl = "https://relayer-v2.polymarket.com";
    const client = new RelayClient(relayerUrl, 137, wallet, builderConfig);

    console.log(`Using owner: ${account.address}`);
    console.log(`Using deposit wallet: ${depositWallet}`);

    const calls: any[] = [];

    // 1. Approve CTF adapter on CTF contract
    const approveData = encodeFunctionData({
        abi: [{
            name: "setApprovalForAll",
            type: "function",
            inputs: [
                { name: "operator", type: "address" },
                { name: "approved", type: "bool" }
            ],
            outputs: []
        }],
        functionName: "setApprovalForAll",
        args: [CTF_ADAPTER as `0x${string}`, true]
    });

    calls.push({
        target: CTF_ADDRESS,
        value: "0",
        data: approveData
    });

    // 2. Call redeemPositions on the CTF adapter
    const redeemData = encodeFunctionData({
        abi: [{
            name: "redeemPositions",
            type: "function",
            inputs: [
                { name: "collateralToken", type: "address" },
                { name: "parentCollectionId", type: "bytes32" },
                { name: "conditionId", type: "bytes32" },
                { name: "indexSets", type: "uint256[]" }
            ],
            outputs: []
        }],
        functionName: "redeemPositions",
        args: [
            USDCE_ADDRESS as `0x${string}`,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            conditionId as `0x${string}`,
            [2n] // IndexSet 2
        ]
    });

    calls.push({
        target: CTF_ADAPTER,
        value: "0",
        data: redeemData
    });

    console.log("Submitting gasless transaction batch...");
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const tx = await client.executeDepositWalletBatch(calls, depositWallet, deadline.toString());
    console.log(`Submitted successfully! Waiting for confirmation...`);
    const receipt = await tx.wait();
    console.log(`Tx confirmed! Hash: ${receipt?.transactionHash || tx.hash}`);
}

main().catch(console.error);
