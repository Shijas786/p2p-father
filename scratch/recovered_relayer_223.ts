import { RelayClient } from "@polymarket/builder-relayer-client";
import { BuilderConfig, BuilderApiKeyCreds } from "@polymarket/builder-signing-sdk";
import { createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wallet as walletService } from "./wallet";
import { env } from "../config/env";

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

class PolymarketRelayerService {
    private isDemoMode = false;

    constructor() {
        const hasCredentials = env.POLYMARKET_PRIVATE_KEY && 
                               env.POLYMARKET_BUILDER_API_KEY && 
                               env.POLYMARKET_BUILDER_SECRET && 
                               env.POLYMARKET_BUILDER_PASSPHRASE;

        if (!hasCredentials) {
            console.warn("⚠️ Polymarket Builder credentials missing. Relayer operating in DEMO mode.");
            this.isDemoMode = true;
        }
    }

    /**
     * Helper 
     */
    async withdrawGasless(userWalletIndex: number, recipientAddress: string, amount: bigint): Promise<string> {
        if (this.isDemoMode) {
            console.log(`[Relayer-Demo] Simulating gasless withdrawal of ${amount} units to ${recipientAddress}`);
            await new Promise(r => setTimeout(r, 1500));
            return "0x_simulated_withdrawal_tx_hash";
        }

        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        const depositWallet = await this.resolveDepositWallet(userWalletIndex);
        const usdcAddress = env.POLYMARKET_USDCE_ADDRESS || "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

        const callData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "transfer",
            args: [recipientAddress as `0x${string}`, amount]
        });

        const withdrawCall = {
            target: usdcAddress,
            value: "0",
            data: callData
        };

        const deadline = Math.floor(Date.now() / 1000 + 3600).toString();

        try {
            console.log(`[Relayer] Submitting gasless withdrawal for proxy: ${depositWallet} to: ${recipientAddress}`);
            const response = await client.executeDepositWalletBatch([withdrawCall], depositWallet, deadline);
            const result = await response.wait();
            return result?.transactionHash || response.transactionHash || response.hash;
        } catch (err: any) {
            console.error("[Relayer] Withdrawal failed:", err.message);
            throw new Error(`Gasless withdrawal failed: ${err.message}`);
        }
    }
}

export const polymarketRelayerService = new PolymarketRelayerService();
