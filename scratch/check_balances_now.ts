import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function main() {
    const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const BASE_RPC = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/sw59DoGWlBSmzxHbuFSNY";

    const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const USDC_POLY = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
    const PUSD = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    const botWallet = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
    const depositWallet = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

    const polyProvider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC);

    const erc20Abi = ["function balanceOf(address) view returns (uint256)"];

    const usdceContract = new ethers.Contract(USDCE, erc20Abi, polyProvider);
    const usdcPolyContract = new ethers.Contract(USDC_POLY, erc20Abi, polyProvider);
    const pusdContract = new ethers.Contract(PUSD, erc20Abi, polyProvider);
    const usdcBaseContract = new ethers.Contract(USDC_BASE, erc20Abi, baseProvider);

    try {
        console.log("=== POLYGON BALANCE ===");
        const botUsdce = await usdceContract.balanceOf(botWallet);
        const botUsdcPoly = await usdcPolyContract.balanceOf(botWallet);
        const botPusd = await pusdContract.balanceOf(botWallet);

        const depUsdce = await usdceContract.balanceOf(depositWallet);
        const depUsdcPoly = await usdcPolyContract.balanceOf(depositWallet);
        const depPusd = await pusdContract.balanceOf(depositWallet);

        console.log(`Bot Wallet (${botWallet})`);
        console.log(` - USDC.e (Polygon): ${ethers.formatUnits(botUsdce, 6)}`);
        console.log(` - USDC (Polygon): ${ethers.formatUnits(botUsdcPoly, 6)}`);
        console.log(` - pUSD (Polygon): ${ethers.formatUnits(botPusd, 6)}`);

        console.log(`Deposit Wallet (${depositWallet})`);
        console.log(` - USDC.e (Polygon): ${ethers.formatUnits(depUsdce, 6)}`);
        console.log(` - USDC (Polygon): ${ethers.formatUnits(depUsdcPoly, 6)}`);
        console.log(` - pUSD (Polygon): ${ethers.formatUnits(depPusd, 6)}`);

        console.log("\n=== BASE BALANCE ===");
        const botUsdcBase = await usdcBaseContract.balanceOf(botWallet);
        const depUsdcBase = await usdcBaseContract.balanceOf(depositWallet);

        console.log(`Bot Wallet (${botWallet})`);
        console.log(` - USDC (Base): ${ethers.formatUnits(botUsdcBase, 6)}`);
        console.log(`Deposit Wallet (${depositWallet})`);
        console.log(` - USDC (Base): ${ethers.formatUnits(depUsdcBase, 6)}`);

    } catch (e: any) {
        console.error("Error checking balances:", e);
    }
}

main();
