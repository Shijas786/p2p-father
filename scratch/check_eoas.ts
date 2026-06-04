import { wallet as walletService } from "../src/services/wallet";
import { polymarketRelayerService } from "../src/services/relayer";
import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const CTF_ADDRESS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
const conditionId = "0x67405fbc8945726be558126fcd7b8a5eae83bea9f8f4f71582e3ec2ffafad384";

async function main() {
    console.log(`Using RPC: ${POLYGON_RPC}`);
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    const pusd = new ethers.Contract(PUSD_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const ctf = new ethers.Contract(CTF_ADDRESS, ["function balanceOf(address, uint256) view returns (uint256)"], provider);

    const indices = [0, 96];

    for (const index of indices) {
        const eoa = walletService.deriveWallet(index);
        const proxy = await polymarketRelayerService.resolveDepositWallet(index);

        console.log(`\n===========================================`);
        console.log(`User Index ${index}`);
        console.log(`EOA Address:   ${eoa.address}`);
        console.log(`Proxy Address: ${proxy}`);
        console.log(`===========================================`);

        // Check MATIC Balances
        const eoaMatic = await provider.getBalance(eoa.address);
        const proxyMatic = await provider.getBalance(proxy);
        console.log(`EOA MATIC:   ${ethers.formatEther(eoaMatic)} MATIC`);
        console.log(`Proxy MATIC: ${ethers.formatEther(proxyMatic)} MATIC`);

        // Check pUSD Balances
        const eoaPusd = await pusd.balanceOf(eoa.address);
        const proxyPusd = await pusd.balanceOf(proxy);
        console.log(`EOA pUSD:   ${ethers.formatUnits(eoaPusd, 6)} pUSD`);
        console.log(`Proxy pUSD: ${ethers.formatUnits(proxyPusd, 6)} pUSD`);

        // Check CTF shares (indexSet 2)
        const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const collectionId = ethers.solidityPackedKeccak256(
            ["bytes32", "bytes32", "uint256"],
            [parentCollectionId, conditionId, 2n]
        );
        const tokenId = BigInt(ethers.solidityPackedKeccak256(
            ["address", "bytes32"],
            [PUSD_ADDRESS, collectionId]
        ));

        const eoaCtf = await ctf.balanceOf(eoa.address, tokenId);
        const proxyCtf = await ctf.balanceOf(proxy, tokenId);
        console.log(`EOA IndexSet 2 CTF Shares:   ${ethers.formatUnits(eoaCtf, 6)}`);
        console.log(`Proxy IndexSet 2 CTF Shares: ${ethers.formatUnits(proxyCtf, 6)}`);
    }
}

main().catch(console.error);
