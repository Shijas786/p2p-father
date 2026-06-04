import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/qMlL6xWpv9OsGOolPeTtR";

const EOA = "0x365d1970c1453bfB446F3fa57Ff440c05c2A5799";
const PROXY = "0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02";

const PUSD_ADDRESS = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";
const USDCE_ADDRESS = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

    console.log("=== CHECKING BALANCES ===");
    console.log(`EOA: ${EOA}`);
    console.log(`Proxy: ${PROXY}`);
    console.log("=========================");

    // MATIC Balances
    const eoaMatic = await provider.getBalance(EOA);
    const proxyMatic = await provider.getBalance(PROXY);
    console.log(`EOA MATIC: ${ethers.formatEther(eoaMatic)} MATIC`);
    console.log(`Proxy MATIC: ${ethers.formatEther(proxyMatic)} MATIC`);

    // ERC20 contract instances
    const pusd = new ethers.Contract(PUSD_ADDRESS, ERC20_ABI, provider);
    const usdce = new ethers.Contract(USDCE_ADDRESS, ERC20_ABI, provider);
    const usdcNative = new ethers.Contract(USDC_NATIVE, ERC20_ABI, provider);

    // EOA ERC20 Balances
    const eoaPusd = await pusd.balanceOf(EOA);
    const eoaUsdce = await usdce.balanceOf(EOA);
    const eoaUsdcNative = await usdcNative.balanceOf(EOA);
    console.log("\n--- EOA ERC20 Balances ---");
    console.log(`pUSD:       ${ethers.formatUnits(eoaPusd, 6)}`);
    console.log(`USDC.e:    ${ethers.formatUnits(eoaUsdce, 6)}`);
    console.log(`USDC (nat): ${ethers.formatUnits(eoaUsdcNative, 6)}`);

    // Proxy ERC20 Balances
    const proxyPusd = await pusd.balanceOf(PROXY);
    const proxyUsdce = await usdce.balanceOf(PROXY);
    const proxyUsdcNative = await usdcNative.balanceOf(PROXY);
    console.log("\n--- Proxy ERC20 Balances ---");
    console.log(`pUSD:       ${ethers.formatUnits(proxyPusd, 6)}`);
    console.log(`USDC.e:    ${ethers.formatUnits(proxyUsdce, 6)}`);
    console.log(`USDC (nat): ${ethers.formatUnits(proxyUsdcNative, 6)}`);
}

main().catch(console.error);
