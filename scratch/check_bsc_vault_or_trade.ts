import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";

const CONTRACTS = [
    "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a",
    "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a"
];

const ESCROW_ABI = [
    "function balances(address user, address token) view returns (uint256)",
    "function totalVaultBalances(address token) view returns (uint256)",
    "function totalEscrowedBalances(address token) view returns (uint256)",
    "function tradeCounter() view returns (uint256)",
    "function getTrade(uint256 tradeId) view returns (tuple(address seller, uint8 status, uint32 createdAt, uint32 deadline, address buyer, uint32 fiatSentAt, address token, address disputeInitiator, uint256 amount, uint256 feeAmount, uint256 buyerReceives))",
    "function withdraw(address token, uint256 amount)"
];

async function main() {
    console.log("🔍 Checking vault balances and active trades on BSC contracts...\n");
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    const relayerAddr = relayerKey ? new ethers.Wallet(relayerKey).address : "";
    const adminAddr = process.env.ADMIN_WALLET_ADDRESS || "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";

    for (const c of CONTRACTS) {
        console.log(`==================================================`);
        console.log(`Contract: ${c}`);
        const escrow = new ethers.Contract(c, ESCROW_ABI, provider);

        try {
            const vaultTot = await escrow.totalVaultBalances(BSC_USDT);
            const escrowTot = await escrow.totalEscrowedBalances(BSC_USDT);
            console.log(`  - Total Vault Balances (USDT): ${ethers.formatUnits(vaultTot, 18)} USDT`);
            console.log(`  - Total Escrowed Balances (USDT): ${ethers.formatUnits(escrowTot, 18)} USDT`);

            // Check relayer and admin internal balances
            for (const u of [relayerAddr, adminAddr]) {
                if (!u) continue;
                const b = await escrow.balances(u, BSC_USDT);
                console.log(`  - Internal Vault Balance for ${u}: ${ethers.formatUnits(b, 18)} USDT`);
            }

            // Check latest trades
            try {
                const count = await escrow.tradeCounter();
                console.log(`  - Total Trades: ${count.toString()}`);

                // Check recent 10 trades
                const start = count > 10n ? count - 10n : 1n;
                for (let tId = count; tId >= start; tId--) {
                    const tr = await escrow.getTrade(tId);
                    if (tr.token.toLowerCase() === BSC_USDT.toLowerCase()) {
                        console.log(`    Trade #${tId}: Seller=${tr.seller}, Buyer=${tr.buyer}, Amount=${ethers.formatUnits(tr.amount, 18)} USDT, Status=${tr.status}`);
                    }
                }
            } catch (e) {}

        } catch (err: any) {
            console.error(`Error querying ${c}:`, err.message || err);
        }
    }
}

main().catch(console.error);
