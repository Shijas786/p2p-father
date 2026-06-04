import { wallet as walletService } from "../src/services/wallet";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const proxyAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02"; // Proxy 0
const userIndex = 0;

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const derived = walletService.deriveWallet(userIndex);
    const ownerWallet = new ethers.Wallet(derived.privateKey, provider);

    console.log(`Owner: ${ownerWallet.address}`);
    console.log(`Proxy: ${proxyAddress}`);

    const biconomyAccount = new ethers.Contract(proxyAddress, [
        "function getNonce(uint256) view returns (uint256)",
        "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 nonce) external view returns (bytes32)",
        "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, bytes calldata signatures) external payable returns (bool)"
    ], ownerWallet);

    try {
        // Query nonce. Biconomy V1/V2 getNonce(0) or getNonce() or nonce()
        let nonce;
        try {
            nonce = await biconomyAccount.getNonce(0);
        } catch (e1) {
            try {
                // Try fallback nonce()
                const rawAccount = new ethers.Contract(proxyAddress, ["function nonce() view returns (uint256)"], provider);
                nonce = await rawAccount.nonce();
            } catch (e2) {
                console.error("Failed to query nonce");
                throw e2;
            }
        }
        console.log(`Biconomy Nonce: ${nonce.toString()}`);

        // Try getTransactionHash with 5 parameters
        const dummyTarget = ethers.ZeroAddress;
        const dummyValue = 0;
        const dummyData = "0x";
        const dummyOperation = 0; // Call

        const hash = await biconomyAccount.getTransactionHash(
            dummyTarget,
            dummyValue,
            dummyData,
            dummyOperation,
            nonce
        );
        console.log(`Successfully obtained transaction hash: ${hash}`);
    } catch (err: any) {
        console.error("Biconomy query failed:", err.message);
    }
}

main().catch(console.error);
