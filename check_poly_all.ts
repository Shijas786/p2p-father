import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function check() {
    const POLYGON_RPC = "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const USDCE = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
    const PUSD = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // wait pusd is different, let me check relayer.ts
    
    const depositWallet = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
    const botWallet = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
    
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const abi = ["function balanceOf(address) view returns (uint256)"];
    
    const usdceContract = new ethers.Contract(USDCE, abi, provider);
    const usdcContract = new ethers.Contract(USDC, abi, provider);
    
    console.log(`Bot Wallet (${botWallet}) USDC.e: ${ethers.formatUnits(await usdceContract.balanceOf(botWallet), 6)}`);
    console.log(`Bot Wallet (${botWallet}) native USDC: ${ethers.formatUnits(await usdcContract.balanceOf(botWallet), 6)}`);
    
    console.log(`Deposit Wallet (${depositWallet}) USDC.e: ${ethers.formatUnits(await usdceContract.balanceOf(depositWallet), 6)}`);
    console.log(`Deposit Wallet (${depositWallet}) native USDC: ${ethers.formatUnits(await usdcContract.balanceOf(depositWallet), 6)}`);
}
check();
