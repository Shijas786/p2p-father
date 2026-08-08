import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const abi = ["function decimals() view returns (uint8)", "function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"];

    const contract = new ethers.Contract(env.USDT_ADDRESS, abi, provider);
    const decs = await contract.decimals();
    const symbol = await contract.symbol();
    const rawBal = await contract.balanceOf(env.ESCROW_CONTRACT_ADDRESS);

    console.log(`Token: ${symbol} (${env.USDT_ADDRESS})`);
    console.log(`Decimals: ${decs}`);
    console.log(`Raw Balance: ${rawBal.toString()}`);
    console.log(`Formatted with ${decs} decimals: ${ethers.formatUnits(rawBal, decs)}`);
    console.log(`Formatted with 18 decimals: ${ethers.formatUnits(rawBal, 18)}`);
}

main().catch(console.error);
