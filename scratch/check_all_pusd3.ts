import { db } from "../src/db/client";
import { ethers } from "ethers";

async function main() {
    const ids = await db.getAllTelegramIds();
    console.log(`Found ${ids.length} users`);
    
    const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const pusdOldAddress = "0xC011a7E40C6dc91F7C5135dB02A8812c6a029583";
    const usdcEAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const usdcAddress = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
    
    const abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const pusdContract = new ethers.Contract(pusdAddress, abi, provider);
    const pusdOldContract = new ethers.Contract(pusdOldAddress, abi, provider);
    const usdcEContract = new ethers.Contract(usdcEAddress, abi, provider);
    const usdcContract = new ethers.Contract(usdcAddress, abi, provider);
    
    for (const id of ids) {
        const user = await db.getUserByTelegramId(id);
        if (!user || !user.wallet_address) continue;
        try {
            const bal = await pusdContract.balanceOf(user.wallet_address);
            const balOld = await pusdOldContract.balanceOf(user.wallet_address);
            const balUsdc = await usdcEContract.balanceOf(user.wallet_address);
            const balUsdcNative = await usdcContract.balanceOf(user.wallet_address);
            
            if (bal > 0n || balOld > 0n || balUsdc > 0n || balUsdcNative > 0n) {
                console.log(`User ${user.telegram_id} (${user.username}) - Hot Wallet ${user.wallet_address}:`);
                console.log(`  pUSD New: ${ethers.formatUnits(bal, 6)}`);
                console.log(`  pUSD Old: ${ethers.formatUnits(balOld, 6)}`);
                console.log(`  USDC.e:   ${ethers.formatUnits(balUsdc, 6)}`);
                console.log(`  USDC (Nat): ${ethers.formatUnits(balUsdcNative, 6)}`);
            }
        } catch(e) {
            // ignore
        }
    }
}
main().catch(console.error).finally(() => process.exit(0));
