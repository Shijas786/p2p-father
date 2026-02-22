import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const V2_BSC = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";
const TOKENS = [
    { symbol: "BNB", address: "0x0000000000000000000000000000000000000000" },
    { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
    { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955" },
];

const ABI = [
    "function setApprovedToken(address _token, bool _approved) external",
    "function approvedTokens(address) view returns (bool)",
    "function owner() view returns (address)",
];

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.BSC_RPC_URL);
    const contract = new ethers.Contract(V2_BSC, ABI, provider);
    const owner = await contract.owner();
    console.log("Contract owner:", owner);

    const signer = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY!, provider);
    console.log("Signer:", signer.address);

    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
        console.error("ERROR: Signer is NOT the contract owner!");
        return;
    }

    const contractSigned = new ethers.Contract(V2_BSC, ABI, signer);

    for (const token of TOKENS) {
        const approved = await contract.approvedTokens(token.address);
        console.log(`\n${token.symbol} (${token.address}): ${approved ? "✅ Already approved" : "❌ NOT approved"}`);

        if (!approved) {
            console.log(`  Adding ${token.symbol}...`);
            const tx = await contractSigned.setApprovedToken(token.address, true, {
                gasPrice: ethers.parseUnits("0.1", "gwei"),
                gasLimit: 50000,
            });
            console.log(`  TX: ${tx.hash}`);
            await tx.wait();
            console.log(`  ✅ ${token.symbol} approved!`);
        }
    }

    console.log("\n✅ All tokens checked and approved!");
}

main().catch(console.error);
