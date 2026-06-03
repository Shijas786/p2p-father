import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function check() {
    const POLYGON_RPC = "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const TARGET = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef"; // Relayer Wallet
    
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const bal = await provider.getBalance(TARGET);
    console.log(`Relayer EOA MATIC Balance on Polygon: ${ethers.formatEther(bal)}`);
}
check();
