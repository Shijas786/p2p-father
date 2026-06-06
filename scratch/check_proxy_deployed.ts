import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
const CTF_EXCHANGE_SPENDER = "0xE111180000d2663C0091e4f400237545B87B996B";

// Token Addresses
const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)"
];

async function main() {
    console.log(`Connecting to: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    // 1. Check if proxy contract is deployed
    const code = await provider.getCode(proxyAddress);
    const isDeployed = code !== "0x";
    console.log(`\nProxy Wallet ${proxyAddress} Deployment Status: ${isDeployed ? "DEPLOYED" : "NOT DEPLOYED"}`);
    if (isDeployed) {
        console.log(`Bytecode length: ${code.length} characters`);
    }

    // 2. Check token allowances for Polymarket Exchange Spender
    const checkAllowance = async (tokenName: string, tokenAddress: string) => {
        try {
            const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
            const allowance = await contract.allowance(proxyAddress, CTF_EXCHANGE_SPENDER);
            console.log(`Allowance for ${tokenName} (${tokenAddress}): ${ethers.formatUnits(allowance, 6)}`);
        } catch (e: any) {
            console.error(`Failed to get allowance for ${tokenName}:`, e.message);
        }
    };

    console.log("\nChecking Spender Allowances for Polymarket CTF Exchange Spender:");
    await checkAllowance("pUSD", PUSD);
    await checkAllowance("USDC", USDC);
    await checkAllowance("USDC.e", USDCE);
}

main().catch(console.error);
