
import { ethers } from "ethers";
import { env } from "../src/config/env";
import { db } from "../src/db/client";

const USER_ADDRESS = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

async function main() {
    console.log(`Checking balance for ${USER_ADDRESS} on Base...`);
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);

    // 1. Check ETH Balance
    const ethBal = await provider.getBalance(USER_ADDRESS);
    console.log(`ETH Balance: ${ethers.formatEther(ethBal)} ETH`);

    // 2. Check USDC Balance (Wallet)
    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address, address) view returns (uint256)"
    ];
    const usdc = new ethers.Contract(USDC_BASE, erc20Abi, provider);
    const usdcBal = await usdc.balanceOf(USER_ADDRESS);
    console.log(`Wallet USDC Balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);

    // 3. Check Vault Balance (Contract Mapping)
    const ESCROW_ADDRESS = "0x78c2B85759C5F7d58fEea82D0Be098E540272245";
    const escrowAbi = ["function balances(address, address) view returns (uint256)"];
    const escrow = new ethers.Contract(ESCROW_ADDRESS, escrowAbi, provider);
    const vaultBal = await escrow.balances(USER_ADDRESS, USDC_BASE);
    console.log(`Vault USDC Balance:  ${ethers.formatUnits(vaultBal, 6)} USDC`);

    // 4. Check Allowance
    const allowance = await usdc.allowance(USER_ADDRESS, ESCROW_ADDRESS);
    console.log(`USDC Allowance:      ${ethers.formatUnits(allowance, 6)} USDC`);

    // 5. Check User Type in DB
    const { data: user, error } = await (db as any).getClient().from('users').select('*').eq('wallet_address', USER_ADDRESS).single();
    if (user) {
        console.log(`DB User: ${user.username} (ID: ${user.id}) Type: ${user.wallet_type}`);
    } else {
        console.log("DB User not found for this address.");
    }
}

main();
