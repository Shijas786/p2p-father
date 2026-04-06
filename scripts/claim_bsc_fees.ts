import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];
const ESCROW_ABI = [
    "function emergencyWithdraw(address token, uint256 amount)",
    "function owner() view returns (address)"
];

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const TARGET_ADDRESS = "0x6C31212a23040998E1D1c157ACe3982aBDBE3154";

async function main() {
    const rpcUrl = process.env.BSC_RPC_URL;
    const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS_BSC;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;

    if (!rpcUrl || !contractAddress || !relayerKey) {
        console.error("Missing config in .env");
        return;
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(relayerKey, provider);
    const escrow = new ethers.Contract(contractAddress, ESCROW_ABI, wallet);
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, wallet);

    console.log(`Using wallet: ${wallet.address}`);
    
    // 1. Check current contract balance
    const contractBal = await usdt.balanceOf(contractAddress);
    console.log(`Contract USDT Balance: ${ethers.formatUnits(contractBal, 18)} USDT`);

    if (contractBal === 0n) {
        console.log("No USDT to withdraw from contract.");
    } else {
        // 2. Call emergencyWithdraw
        console.log("Calling emergencyWithdraw...");
        const tx1 = await escrow.emergencyWithdraw(USDT_BSC, contractBal, {
            gasPrice: ethers.parseUnits("1.1", "gwei") // BSC usually ~1-3 gwei
        });
        console.log(`Withdrawal TX: ${tx1.hash}`);
        await tx1.wait();
        console.log("Withdrawal confirmed.");
    }

    // 3. Check wallet balance
    const walletBal = await usdt.balanceOf(wallet.address);
    console.log(`Wallet USDT Balance: ${ethers.formatUnits(walletBal, 18)} USDT`);

    if (walletBal === 0n) {
        console.log("No USDT in wallet to transfer.");
        return;
    }

    // 4. Transfer to target
    console.log(`Transferring ${ethers.formatUnits(walletBal, 18)} USDT to ${TARGET_ADDRESS}...`);
    const tx2 = await usdt.transfer(TARGET_ADDRESS, walletBal, {
        gasPrice: ethers.parseUnits("1.1", "gwei")
    });
    console.log(`Transfer TX: ${tx2.hash}`);
    await tx2.wait();
    console.log("Transfer confirmed! 🎉");
}

main().catch(console.error);
