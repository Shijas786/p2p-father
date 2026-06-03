import { ethers } from "ethers";
import { config } from "dotenv";
config();

async function run() {
    const POLYGON_RPC = process.env.POLYGON_RPC || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
    const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
    const depositWallet = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

    const pusd = new ethers.Contract(PUSD_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
    const usdce = new ethers.Contract(USDCE_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);

    const pusdBal = await pusd.balanceOf(depositWallet);
    const usdceBal = await usdce.balanceOf(depositWallet);

    console.log(`pUSD Balance: ${ethers.formatUnits(pusdBal, 6)}`);
    console.log(`USDC.e Balance: ${ethers.formatUnits(usdceBal, 6)}`);
}
run();
