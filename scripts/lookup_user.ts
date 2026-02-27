import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)"
];

async function main() {
    const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
    const username = "Trumpisbad";

    const { data: user, error } = await s.from("users")
        .select("*")
        .or(`username.eq.${username},username.eq.@${username}`)
        .single();

    if (error || !user) {
        console.error("User not found:", error || "No user matches");
        return;
    }

    console.log("Found User:", {
        id: user.id,
        username: user.username,
        wallet: user.wallet_address,
        wallet_type: user.wallet_type
    });

    const address = user.wallet_address;
    if (!address) {
        console.log("User has no wallet address.");
        return;
    }

    // Providers
    const baseP = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL || "https://mainnet.base.org");
    const bscP = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/");

    // BSC Token addresses
    const bscUsdc = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
    const bscUsdt = "0x55d398326f99059fF775485246999027B3197955";
    const native = "0x0000000000000000000000000000000000000000";

    // Base Token addresses
    const baseUsdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    const baseUsdt = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

    // Escrow Contract Addresses
    const baseEscrow = process.env.ESCROW_CONTRACT_ADDRESS || "0xf20872C359788a53958a048413D64F183403B1f1";
    const bscEscrow = process.env.ESCROW_CONTRACT_ADDRESS_BSC || "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

    async function getBal(p: any, addr: string, token?: string) {
        try {
            if (!token || token === native) {
                const b = await p.getBalance(addr);
                return ethers.formatEther(b);
            }
            const c = new ethers.Contract(token, ERC20_ABI, p);
            const [b, d] = await Promise.all([c.balanceOf(addr), c.decimals()]);
            return ethers.formatUnits(b, d);
        } catch (e) {
            return "0.0";
        }
    }

    async function getVaultBal(p: any, escrow: string, userAddr: string, tokenAddr: string) {
        try {
            const c = new ethers.Contract(escrow, ESCROW_ABI, p);
            const bal = await c.balances(userAddr, tokenAddr);

            let decimals = 18;
            if (tokenAddr !== native) {
                const tc = new ethers.Contract(tokenAddr, ERC20_ABI, p);
                decimals = await tc.decimals();
            }
            return ethers.formatUnits(bal, decimals);
        } catch (e) {
            return "0.0";
        }
    }

    console.log("\n--- Wallet Balances ---");
    const [eth, bnb, bUsdc, bUsdt, sUsdc, sUsdt] = await Promise.all([
        getBal(baseP, address),
        getBal(bscP, address),
        getBal(baseP, address, baseUsdc),
        getBal(baseP, address, baseUsdt),
        getBal(bscP, address, bscUsdc),
        getBal(bscP, address, bscUsdt)
    ]);

    console.log(`Base ETH: ${eth}`);
    console.log(`Base USDC: ${bUsdc}`);
    console.log(`Base USDT: ${bUsdt}`);
    console.log(`BSC BNB: ${bnb}`);
    console.log(`BSC USDC: ${sUsdc}`);
    console.log(`BSC USDT: ${sUsdt}`);

    console.log("\n--- Vault Balances ---");
    const [vBUsdc, vBUsdt, vSNative, vSUsdc, vSUsdt] = await Promise.all([
        getVaultBal(baseP, baseEscrow, address, baseUsdc),
        getVaultBal(baseP, baseEscrow, address, baseUsdt),
        getVaultBal(bscP, bscEscrow, address, native),
        getVaultBal(bscP, bscEscrow, address, bscUsdc),
        getVaultBal(bscP, bscEscrow, address, bscUsdt)
    ]);

    console.log(`Vault Base USDC: ${vBUsdc}`);
    console.log(`Vault Base USDT: ${vBUsdt}`);
    console.log(`Vault BSC BNB: ${vSNative}`);
    console.log(`Vault BSC USDC: ${vSUsdc}`);
    console.log(`Vault BSC USDT: ${vSUsdt}`);
}

main();
