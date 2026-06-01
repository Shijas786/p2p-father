import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL;
const ESCROW_OLD = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const ESCROW_NEW = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const USER = "0x08FFc32adA724BEAE008f5C08bb1C06c1a737e10";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)"
];

async function main() {
    if (!BSC_RPC_URL) return;
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    
    // Direct BNB balance
    const bnbBal = await provider.getBalance(USER);
    console.log(`[WALLET BNB] Balance: ${ethers.formatEther(bnbBal)} BNB`);

    // Direct USDT balance
    const usdtContract = new ethers.Contract(BSC_USDT, ABI, provider);
    const usdtBal = await usdtContract.balanceOf(USER);
    console.log(`[WALLET USDT] Balance: ${ethers.formatUnits(usdtBal, 18)} USDT`);

    const contractOld = new ethers.Contract(ESCROW_OLD, ABI, provider);
    const balOld = await contractOld.balances(USER, BSC_USDT);
    console.log(`[OLD ESCROW VAULT] USDT Balance: ${ethers.formatUnits(balOld, 18)}`);

    const contractNew = new ethers.Contract(ESCROW_NEW, ABI, provider);
    const balNew = await contractNew.balances(USER, BSC_USDT);
    console.log(`[NEW ESCROW VAULT] USDT Balance: ${ethers.formatUnits(balNew, 18)}`);
}

main();

