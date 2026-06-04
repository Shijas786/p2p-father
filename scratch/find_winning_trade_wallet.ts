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

    const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const collectionId = ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint256"],
        [parentCollectionId, conditionId, 2n] // IndexSet 2 is NO/Down
    );
    const tokenId = BigInt(ethers.solidityPackedKeccak256(
        ["address", "bytes32"],
        [PUSD_ADDRESS, collectionId]
    ));

    console.log(`Scanning indices 0 to 120...`);
    for (let i = 0; i <= 120; i++) {
        try {
            const eoa = walletService.deriveWallet(i);
            const proxy = await polymarketRelayerService.resolveDepositWallet(i);

            // EOA pUSD Balance
            const eoaPusd = await pusd.balanceOf(eoa.address);
            // Proxy pUSD Balance
            const proxyPusd = await pusd.balanceOf(proxy);

            // Outcome shares
            const eoaCtf = await ctf.balanceOf(eoa.address, tokenId);
            const proxyCtf = await ctf.balanceOf(proxy, tokenId);

            // MATIC balance
            const eoaMatic = await provider.getBalance(eoa.address);
            const proxyMatic = await provider.getBalance(proxy);

            if (eoaPusd > 0n || proxyPusd > 0n || eoaCtf > 0n || proxyCtf > 0n || eoaMatic > ethers.parseEther("0.05")) {
                console.log(`\nFound activity at Index ${i}:`);
                console.log(`  EOA:   ${eoa.address}`);
                console.log(`  Proxy: ${proxy}`);
                if (eoaMatic > 0n) console.log(`  EOA MATIC:   ${ethers.formatEther(eoaMatic)}`);
                if (proxyMatic > 0n) console.log(`  Proxy MATIC: ${ethers.formatEther(proxyMatic)}`);
                if (eoaPusd > 0n) console.log(`  EOA pUSD:    ${ethers.formatUnits(eoaPusd, 6)}`);
                if (proxyPusd > 0n) console.log(`  Proxy pUSD:  ${ethers.formatUnits(proxyPusd, 6)}`);
                if (eoaCtf > 0n) console.log(`  EOA CTF Shares:   ${ethers.formatUnits(eoaCtf, 6)}`);
                if (proxyCtf > 0n) console.log(`  Proxy CTF Shares: ${ethers.formatUnits(proxyCtf, 6)}`);
            }
        } catch (err: any) {
            // Ignore derivation errors
        }
    }
    console.log(`\nScan complete.`);
}

main().catch(console.error);
