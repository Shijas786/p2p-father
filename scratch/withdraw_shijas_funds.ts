import { polymarketRelayerService } from "../src/services/relayer";
import { ethers } from "ethers";

const POLYGON_RPC = "https://polygon.llamarpc.com";
const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const proxyAddress = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const recipientAddress = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";
const userIndex = 96;

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const pusd = new ethers.Contract(PUSD_ADDRESS, [
        "function balanceOf(address) view returns (uint256)"
    ], provider);

    const balance = await pusd.balanceOf(proxyAddress);
    console.log(`Current pUSD Balance in proxy (${proxyAddress}): ${ethers.formatUnits(balance, 6)} pUSD`);

    if (balance > 0n) {
        console.log(`Withdrawing ${ethers.formatUnits(balance, 6)} pUSD gaslessly to main wallet: ${recipientAddress}...`);
        try {
            const txHash = await polymarketRelayerService.withdrawGasless(userIndex, recipientAddress, balance);
            console.log(`Withdrawal successful! Tx Hash: ${txHash}`);
        } catch (err: any) {
            console.error("Withdrawal failed:", err.message);
        }
    } else {
        console.log("No pUSD balance found to withdraw.");
    }
}

main().catch(console.error);
