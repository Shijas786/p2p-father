import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const ESCROW_ABI = [
    "function owner() view returns (address)",
    "function totalVaultBalances(address) view returns (uint256)",
    "function totalEscrowedBalances(address) view returns (uint256)",
    "function emergencyWithdraw(address _token, uint256 _amount) external"
];

// Contracts to check
const CONTRACTS = [
    { chain: "BSC", rpc: BSC_RPC_URL, address: "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a", tokens: [{symbol: "USDT", addr: BSC_USDT}, {symbol: "USDC", addr: BSC_USDC}] },
    { chain: "BSC", rpc: BSC_RPC_URL, address: process.env.ESCROW_CONTRACT_ADDRESS_BSC, tokens: [{symbol: "USDT", addr: BSC_USDT}, {symbol: "USDC", addr: BSC_USDC}] },
    { chain: "BASE", rpc: BASE_RPC_URL, address: process.env.ESCROW_CONTRACT_ADDRESS, tokens: [{symbol: "USDC", addr: BASE_USDC}, {symbol: "USDT", addr: BASE_USDT}] }
];

async function main() {
    console.log("==================================================");
    console.log("🚨 Emergency Recovery & Forwarding to Relayer Wallet");
    console.log("==================================================\n");

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    const masterSeed = process.env.MASTER_WALLET_SEED;

    if (!relayerKey) {
        throw new Error("RELAYER_PRIVATE_KEY is missing from environment.");
    }

    const relayerWallet = new ethers.Wallet(relayerKey);
    console.log(`📍 Relayer & Contract Owner Wallet Address: ${relayerWallet.address}`);
    const activeOwnerSigner = relayerWallet;

    for (const c of CONTRACTS) {
        if (!c.address || c.address === "") continue;
        console.log(`\n--------------------------------------------------`);
        console.log(`Checking Network: ${c.chain} | Contract: ${c.address}`);
        const provider = new ethers.JsonRpcProvider(c.rpc);

        try {
            const escrow = new ethers.Contract(c.address, ESCROW_ABI, provider);
            const ownerAddr = await escrow.owner();
            const signer = relayerWallet.connect(provider);

            for (const t of c.tokens) {
                if (!t.addr) continue;
                const erc20 = new ethers.Contract(t.addr, ERC20_ABI, provider);
                const decimals = await erc20.decimals();
                const contractErc20Bal = await erc20.balanceOf(c.address);

                let vaultBal = 0n;
                let escrowBal = 0n;
                try {
                    vaultBal = await escrow.totalVaultBalances(t.addr);
                    escrowBal = await escrow.totalEscrowedBalances(t.addr);
                } catch (e) {}

                const lockedBal = vaultBal + escrowBal;
                const excessBal = contractErc20Bal > lockedBal ? contractErc20Bal - lockedBal : 0n;

                console.log(`Token: ${t.symbol} (${t.addr})`);
                console.log(`  - Contract ERC20 Balance: ${ethers.formatUnits(contractErc20Bal, decimals)}`);
                console.log(`  - Accounting Locked:      ${ethers.formatUnits(lockedBal, decimals)}`);
                console.log(`  - Recoverable Excess:     ${ethers.formatUnits(excessBal, decimals)}`);

                if (excessBal > 0n) {
                    console.log(`\n🔥 Found ${ethers.formatUnits(excessBal, decimals)} stuck ${t.symbol}! Initiating withdrawal...`);

                    if (signer.address.toLowerCase() !== ownerAddr.toLowerCase()) {
                        console.log(`⚠️ Signer (${signer.address}) does not match Contract Owner (${ownerAddr}). Cannot call emergencyWithdraw.`);
                        continue;
                    }

                    // 1. Emergency Withdraw to Owner Wallet
                    const escrowSigner = escrow.connect(signer) as any;
                    console.log(`Calling emergencyWithdraw(${t.addr}, ${excessBal})...`);
                    const withdrawTx = await escrowSigner.emergencyWithdraw(t.addr, excessBal);
                    console.log(`Withdraw Tx Submitted: ${withdrawTx.hash}`);
                    await withdrawTx.wait();
                    console.log(`✅ Withdraw Tx Confirmed! Tokens delivered to Relayer Wallet (${signer.address}).`);
                }
            }
        } catch (err: any) {
            console.error(`Error on contract ${c.address}:`, err.message || err);
        }
    }
}

main().catch(console.error);
