import { db } from "../src/db/client";
import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const users = await db.getAllUsers();
    console.log(`Found ${users.length} users`);
    
    const provider = new ethers.JsonRpcProvider("https://polygon-rpc.com");
    const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const usdcEAddress = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    
    const abi = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];
    const pusdContract = new ethers.Contract(pusdAddress, abi, provider);
    const usdcEContract = new ethers.Contract(usdcEAddress, abi, provider);
    
    for (const user of users) {
        if (!user.wallet_address) continue;
        try {
            const bal = await pusdContract.balanceOf(user.wallet_address);
            const balUsdc = await usdcEContract.balanceOf(user.wallet_address);
            if (bal > 0n || balUsdc > 0n) {
                console.log(`User ${user.telegram_id} (${user.username}) - Hot Wallet ${user.wallet_address}:`);
                console.log(`  pUSD: ${ethers.formatUnits(bal, 6)}`);
                console.log(`  USDC.e: ${ethers.formatUnits(balUsdc, 6)}`);
            }
        } catch(e) {}
    }
}
main().catch(console.error).finally(() => process.exit(0));
