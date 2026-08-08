import { db } from "../src/db/client";
import { escrow } from "../src/services/escrow";
import { env } from "../src/config/env";
import { ethers } from "ethers";

async function main() {
    console.log("=== Checking User @freesapien ===");
    
    // 1. Get user from DB
    const client = (db as any).getClient();
    const { data: user, error } = await client
        .from("users")
        .select("*")
        .ilike("username", "freesapien")
        .single();

    if (error || !user) {
        console.error("User @freesapien not found:", error?.message);
        // Try searching without @ or by substring
        const { data: searchUsers } = await client
            .from("users")
            .select("id, username, first_name, telegram_id, wallet_address")
            .ilike("username", "%freesapien%");
        console.log("Search results:", searchUsers);
        return;
    }

    console.log("User details:", {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        wallet_address: user.wallet_address,
        wallet_index: user.wallet_index,
        created_at: user.created_at
    });

    const walletAddress = user.wallet_address;
    if (!walletAddress) {
        console.log("User has no wallet_address assigned!");
        return;
    }

    // 2. Check Vault Balance on Base & BSC
    console.log("\n--- Checking On-Chain Balances ---");
    const baseUsdcAddress = env.USDC_ADDRESS; // Base USDC
    const baseUsdtAddress = env.USDT_ADDRESS; // Base USDT
    
    try {
        const baseUsdcVault = await escrow.getVaultBalance(walletAddress, baseUsdcAddress, "base");
        console.log(`Base Vault USDC Balance: ${baseUsdcVault}`);
    } catch (e: any) {
        console.error("Error reading Base USDC Vault:", e.message);
    }

    try {
        const baseUsdtVault = await escrow.getVaultBalance(walletAddress, baseUsdtAddress, "base");
        console.log(`Base Vault USDT Balance: ${baseUsdtVault}`);
    } catch (e: any) {
        console.error("Error reading Base USDT Vault:", e.message);
    }

    // 3. Direct Wallet ERC20 Balance on Base (if tokens are in wallet instead of vault)
    const provider = new ethers.JsonRpcProvider(env.BASE_RPC_URL);
    const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    
    try {
        const usdcContract = new ethers.Contract(baseUsdcAddress, erc20Abi, provider);
        const rawBal = await usdcContract.balanceOf(walletAddress);
        const decs = await usdcContract.decimals();
        console.log(`Base Direct Wallet USDC Balance: ${ethers.formatUnits(rawBal, decs)}`);
    } catch (e: any) {
        console.error("Error reading direct USDC wallet balance:", e.message);
    }

    // 4. Check Active Orders
    console.log("\n--- Active Orders ---");
    const { data: orders } = await client
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active");
    console.log(`Active orders (${orders?.length || 0}):`, orders);

    // 5. Check Recent Trades
    console.log("\n--- Recent Trades (Last 5) ---");
    const { data: trades } = await client
        .from("trades")
        .select("*")
        .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(5);
    console.log("Recent trades:", trades);

    // 6. Check Escrow contract events or direct deposit/withdrawals if any
    console.log("\n--- Check Reserved Amounts ---");
    const reservedUsdc = await db.getReservedAmount(user.id, "USDC", "base");
    const reservedUsdt = await db.getReservedAmount(user.id, "USDT", "base");
    console.log(`Reserved USDC: ${reservedUsdc}, Reserved USDT: ${reservedUsdt}`);
}

main().catch(console.error);
