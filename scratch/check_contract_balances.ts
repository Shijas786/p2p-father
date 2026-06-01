import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BASE_RPC_URL = process.env.BASE_RPC_URL;
const BSC_RPC_URL = process.env.BSC_RPC_URL;

const ESCROW_BASE = process.env.ESCROW_CONTRACT_ADDRESS;
const ESCROW_BSC = process.env.ESCROW_CONTRACT_ADDRESS_BSC;

const BASE_USDC = process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = process.env.USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_BNB = "0x0000000000000000000000000000000000000000";

const ESCROW_ABI = [
    "function getContractBalance(address token) view returns (uint256)",
    "function totalVaultBalances(address token) view returns (uint256)",
    "function totalEscrowedBalances(address token) view returns (uint256)",
    "function totalFeesCollected(address token) view returns (uint256)"
];

async function check() {
    const baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const contractBase = new ethers.Contract(ESCROW_BASE!, ESCROW_ABI, baseProvider);
    const contractBsc = new ethers.Contract(ESCROW_BSC!, ESCROW_ABI, bscProvider);

    console.log("=== BASE CONTRACT ===");
    for (const token of [{name: "USDC", addr: BASE_USDC}, {name: "USDT", addr: BASE_USDT}, {name: "ETH", addr: BSC_BNB}]) {
        const bal = await contractBase.getContractBalance(token.addr);
        const vault = await contractBase.totalVaultBalances(token.addr);
        const escrow = await contractBase.totalEscrowedBalances(token.addr);
        const fees = await contractBase.totalFeesCollected(token.addr);
        if (bal > 0n || vault > 0n || escrow > 0n || fees > 0n) {
            console.log(`${token.name}: Bal=${bal}, Vault=${vault}, Escrow=${escrow}, Fees=${fees}`);
        }
    }

    console.log("\n=== BSC CONTRACT ===");
    for (const token of [{name: "USDC", addr: BSC_USDC}, {name: "USDT", addr: BSC_USDT}, {name: "BNB", addr: BSC_BNB}]) {
        const bal = await contractBsc.getContractBalance(token.addr);
        const vault = await contractBsc.totalVaultBalances(token.addr);
        const escrow = await contractBsc.totalEscrowedBalances(token.addr);
        const fees = await contractBsc.totalFeesCollected(token.addr);
        if (bal > 0n || vault > 0n || escrow > 0n || fees > 0n) {
            console.log(`${token.name}: Bal=${bal}, Vault=${vault}, Escrow=${escrow}, Fees=${fees}`);
        }
    }
}

check().catch(console.error);
