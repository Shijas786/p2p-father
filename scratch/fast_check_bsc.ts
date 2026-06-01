import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

const ESCROW_ABI = [
    "function getContractBalance(address token) view returns (uint256)",
    "function totalVaultBalances(address token) view returns (uint256)",
    "function totalEscrowedBalances(address token) view returns (uint256)",
    "function totalFeesCollected(address token) view returns (uint256)"
];

async function check() {
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const contractBsc = new ethers.Contract(ESCROW_BSC, ESCROW_ABI, bscProvider);

    console.log("=== BSC CONTRACT ===");
    for (const token of [
        {name: "USDC", addr: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"},
        {name: "USDT", addr: "0x55d398326f99059fF775485246999027B3197955"},
        {name: "BNB", addr: "0x0000000000000000000000000000000000000000"}
    ]) {
        try {
            const bal = await contractBsc.getContractBalance(token.addr);
            const vault = await contractBsc.totalVaultBalances(token.addr);
            const escrow = await contractBsc.totalEscrowedBalances(token.addr);
            const fees = await contractBsc.totalFeesCollected(token.addr);
            if (bal > 0n || vault > 0n || escrow > 0n || fees > 0n) {
                console.log(`${token.name}: Bal=${ethers.formatEther(bal)}, Vault=${ethers.formatEther(vault)}, Escrow=${ethers.formatEther(escrow)}, Fees=${ethers.formatEther(fees)}`);
            }
        } catch (e: any) {
            console.error(`Error checking ${token.name}: ${e.message}`);
        }
    }
}

check().catch(console.error);
