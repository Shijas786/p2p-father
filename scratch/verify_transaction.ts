import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const sourceAddr = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const destAddr = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

const txHash = "0xb58b88d34e6dcee63a254cfd185e67883e0b9ebfef7cb3f11e19b215eE11B267";

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const pusd = new ethers.Contract(PUSD_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
    ], provider);
    
    const usdce = new ethers.Contract(USDCE_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
    ], provider);

    // 1. Check transaction status
    try {
        console.log(`Checking transaction status for hash: ${txHash}...`);
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
            console.log(`Transaction Receipt Found! Status: ${receipt.status === 1 ? "SUCCESS" : "FAILED (reverted)"}`);
            console.log(`Block Number: ${receipt.blockNumber}`);
        } else {
            console.log("Transaction receipt not found (tx may still be pending or was dropped).");
        }
    } catch (err: any) {
        console.error("Failed to fetch transaction status:", err.message);
    }

    // 2. Query Balances
    const srcPusd = await pusd.balanceOf(sourceAddr);
    const srcUsdce = await usdce.balanceOf(sourceAddr);
    const destPusd = await pusd.balanceOf(destAddr);
    const destUsdce = await usdce.balanceOf(destAddr);

    console.log(`\nSource Wallet (${sourceAddr}):`);
    console.log(`  pUSD:   ${ethers.formatUnits(srcPusd, 6)}`);
    console.log(`  USDC.e: ${ethers.formatUnits(srcUsdce, 6)}`);

    console.log(`\nDestination Wallet (${destAddr}):`);
    console.log(`  pUSD:   ${ethers.formatUnits(destPusd, 6)}`);
    console.log(`  USDC.e: ${ethers.formatUnits(destUsdce, 6)}`);
}

main().catch(console.error);
