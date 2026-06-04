import { db } from "../src/db/client";
import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const CTF_ADDRESS = ethers.getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";
const indexSet = 2; // Winning indexSet since payoutNumerator 1 is 1

const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
const collectionId = ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32", "uint256"],
    [parentCollectionId, conditionId, BigInt(indexSet)]
);

const tokenIdPUSD = BigInt(ethers.solidityPackedKeccak256(
    ["address", "bytes32"],
    [PUSD_ADDRESS, collectionId]
));
const tokenIdUSDCE = BigInt(ethers.solidityPackedKeccak256(
    ["address", "bytes32"],
    [USDCE_ADDRESS, collectionId]
));

async function main() {
    const client = db.getClient();
    const { data: users, error } = await client
        .from("users")
        .select("id, wallet_index, deposit_wallet_address")
        .not("deposit_wallet_address", "is", null);

    if (error) {
        console.error("DB error:", error);
        return;
    }

    console.log(`Checking balances for ${users?.length} users...`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const ctf = new ethers.Contract(CTF_ADDRESS, [
        "function balanceOf(address, uint256) view returns (uint256)"
    ], provider);

    for (const user of users || []) {
        const balPUSD = await ctf.balanceOf(user.deposit_wallet_address, tokenIdPUSD);
        const balUSDCE = await ctf.balanceOf(user.deposit_wallet_address, tokenIdUSDCE);
        
        console.log(`User ${user.wallet_index} (${user.deposit_wallet_address}):`);
        console.log(`  PUSD Token ID Balance:  ${balPUSD.toString()}`);
        console.log(`  USDCE Token ID Balance: ${balUSDCE.toString()}`);
    }
}

main().catch(console.error);
