import { ethers } from "ethers";
import { env } from "../src/config/env";

async function main() {
    const freesapienWallet = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";
    const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");

    const erc20 = new ethers.Contract(env.USDC_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const escrow = new ethers.Contract(env.ESCROW_CONTRACT_ADDRESS, ["function balances(address user, address token) view returns (uint256)"], provider);

    const directBal = await erc20.balanceOf(freesapienWallet);
    const vaultBal = await escrow.balances(freesapienWallet, env.USDC_ADDRESS);

    console.log("=== @freesapien Final Balances ===");
    console.log(`Direct Wallet USDC: ${ethers.formatUnits(directBal, 6)} USDC`);
    console.log(`Escrow Vault USDC: ${ethers.formatUnits(vaultBal, 6)} USDC`);
}

main().catch(console.error);
