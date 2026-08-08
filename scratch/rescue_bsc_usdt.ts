import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955"; // BEP-20 USDT on BSC (18 decimals)

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

// Check all possible BSC contract addresses in the project
const BSC_CONTRACT_ADDRESSES = [
    "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a",
    "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a",
    process.env.ESCROW_CONTRACT_ADDRESS_BSC,
    process.env.REWARD_CONTRACT_ADDRESS
].filter((addr): addr is string => Boolean(addr) && addr !== "");

async function main() {
    console.log("==================================================");
    console.log("🎯 Searching & Rescuing 1.25 USDT on BSC");
    console.log("==================================================");

    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    if (!relayerKey) {
        throw new Error("RELAYER_PRIVATE_KEY is missing from environment.");
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const relayerWallet = new ethers.Wallet(relayerKey, provider);
    console.log(`Relayer / Owner Wallet Address: ${relayerWallet.address}\n`);

    const uniqueContracts = Array.from(new Set(BSC_CONTRACT_ADDRESSES.map(a => a.toLowerCase())));

    for (const contractAddr of uniqueContracts) {
        console.log(`--------------------------------------------------`);
        console.log(`Checking BSC Contract Address: ${contractAddr}`);

        try {
            const usdt = new ethers.Contract(BSC_USDT, ERC20_ABI, provider);
            const decimals = await usdt.decimals();
            const totalErc20Bal = await usdt.balanceOf(contractAddr);

            const escrow = new ethers.Contract(contractAddr, ESCROW_ABI, provider);
            const ownerAddr = await escrow.owner();
            console.log(`  - Contract Owner: ${ownerAddr}`);
            console.log(`  - Actual USDT Balance in Contract: ${ethers.formatUnits(totalErc20Bal, decimals)} USDT`);

            let vaultBal = 0n;
            let escrowBal = 0n;
            try {
                vaultBal = await escrow.totalVaultBalances(BSC_USDT);
                escrowBal = await escrow.totalEscrowedBalances(BSC_USDT);
            } catch (e) {}

            const lockedBal = vaultBal + escrowBal;
            console.log(`  - Internal Accounting Locked:      ${ethers.formatUnits(lockedBal, decimals)} USDT`);

            const excessBal = totalErc20Bal > lockedBal ? totalErc20Bal - lockedBal : 0n;
            console.log(`  - Unallocated Excess Balance:       ${ethers.formatUnits(excessBal, decimals)} USDT`);

            if (excessBal > 0n) {
                console.log(`\n🚀 Recoverable USDT detected: ${ethers.formatUnits(excessBal, decimals)} USDT!`);

                if (relayerWallet.address.toLowerCase() === ownerAddr.toLowerCase()) {
                    console.log(`Calling emergencyWithdraw(${BSC_USDT}, ${excessBal})...`);
                    const escrowSigner = escrow.connect(relayerWallet) as any;
                    const tx = await escrowSigner.emergencyWithdraw(BSC_USDT, excessBal);
                    console.log(`Tx submitted! Tx Hash: ${tx.hash}`);
                    const receipt = await tx.wait();
                    console.log(`✅ SUCCESS! ${ethers.formatUnits(excessBal, decimals)} USDT recovered to Relayer Wallet in block ${receipt.blockNumber}!`);
                } else {
                    console.log(`⚠️ Relayer Wallet (${relayerWallet.address}) is not the owner of ${contractAddr} (Owner is ${ownerAddr}).`);
                }
            } else {
                console.log(`No unallocated excess USDT found on contract ${contractAddr}.`);
            }
        } catch (err: any) {
            console.error(`Error querying ${contractAddr}:`, err.message || err);
        }
    }
}

main().catch(console.error);
