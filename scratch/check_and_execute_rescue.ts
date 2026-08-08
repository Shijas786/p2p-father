import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL || "https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";

const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";

const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";

const POLYGON_USDT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const POLYGON_USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

const ESCROW_ABI = [
    "function owner() view returns (address)",
    "function totalVaultBalances(address) view returns (uint256)",
    "function totalEscrowedBalances(address) view returns (uint256)",
    "function emergencyWithdraw(address _token, uint256 _amount) external"
];

// List of potential contracts from the repo
const CONTRACTS = [
    { chain: "BSC", rpc: BSC_RPC_URL, address: "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a", tokens: [{symbol: "USDT", addr: BSC_USDT}, {symbol: "USDC", addr: BSC_USDC}] },
    { chain: "BSC", rpc: BSC_RPC_URL, address: process.env.ESCROW_CONTRACT_ADDRESS_BSC, tokens: [{symbol: "USDT", addr: BSC_USDT}, {symbol: "USDC", addr: BSC_USDC}] },
    { chain: "BASE", rpc: BASE_RPC_URL, address: process.env.ESCROW_CONTRACT_ADDRESS, tokens: [{symbol: "USDC", addr: BASE_USDC}, {symbol: "USDT", addr: BASE_USDT}] }
];

async function main() {
    console.log("🔍 Scanning smart contracts for stuck / excess USDT & USDC balances...\n");

    let adminSigner: ethers.Signer | null = null;
    let masterSeed = process.env.MASTER_WALLET_SEED;
    let relayerKey = process.env.RELAYER_PRIVATE_KEY;

    if (masterSeed) {
        const hdWallet = ethers.HDNodeWallet.fromMnemonic(ethers.Mnemonic.fromPhrase(masterSeed));
        adminSigner = hdWallet;
        console.log(`Derived Admin Wallet from seed: ${hdWallet.address}`);
    } else if (relayerKey) {
        adminSigner = new ethers.Wallet(relayerKey);
        console.log(`Using Relayer Wallet: ${(adminSigner as ethers.Wallet).address}`);
    }

    for (const c of CONTRACTS) {
        if (!c.address || c.address === "") continue;
        console.log(`--------------------------------------------------`);
        console.log(`Network: ${c.chain} | Contract: ${c.address}`);
        const provider = new ethers.JsonRpcProvider(c.rpc);

        try {
            const escrow = new ethers.Contract(c.address, ESCROW_ABI, provider);
            const ownerAddr = await escrow.owner();
            console.log(`Contract Owner: ${ownerAddr}`);

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
                console.log(`  - Actual ERC20 Balance in Contract: ${ethers.formatUnits(contractErc20Bal, decimals)}`);
                console.log(`  - Internal Locked (Vault + Escrow): ${ethers.formatUnits(lockedBal, decimals)}`);
                console.log(`  - Excess / Stuck Balance:          ${ethers.formatUnits(excessBal, decimals)}`);

                if (excessBal > 0n) {
                    console.log(`\n🚨 FOUND ${ethers.formatUnits(excessBal, decimals)} STUCK ${t.symbol}!`);

                    if (adminWallet) {
                        const signer = adminWallet.connect(provider);
                        if (signer.address.toLowerCase() === ownerAddr.toLowerCase()) {
                            console.log(`⚡ Initiating emergencyWithdraw for ${ethers.formatUnits(excessBal, decimals)} ${t.symbol}...`);
                            const escrowWithSigner = escrow.connect(signer) as any;
                            const tx = await escrowWithSigner.emergencyWithdraw(t.addr, excessBal);
                            console.log(`Transaction sent! Tx Hash: ${tx.hash}`);
                            const receipt = await tx.wait();
                            console.log(`✅ SUCCESS! Transaction confirmed in block ${receipt.blockNumber}.`);
                            console.log(`Funds recovered to Owner Wallet (${signer.address}).`);
                        } else {
                            console.log(`⚠️ Signer (${signer.address}) does not match Contract Owner (${ownerAddr}).`);
                            console.log(`Please sign with the Owner Wallet private key.`);
                        }
                    } else {
                        console.log(`⚠️ No Admin private key available in environment to execute automated withdrawal.`);
                    }
                }
            }
        } catch (err: any) {
            console.error(`Error querying contract ${c.address} on ${c.chain}:`, err.message || err);
        }
    }
}

main().catch(console.error);
