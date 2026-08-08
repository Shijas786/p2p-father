import { ethers } from "ethers";
import { env } from "../src/config/env";

const walletAddress = "0x6540Bb882aE5b710C5a0efd9F76dada30ac7F9cF";

async function checkChain(chainName: string, rpcUrl: string, escrowAddress: string, tokens: { name: string; addr: string }[]) {
    console.log(`\n=================== ${chainName.toUpperCase()} ===================`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Check ETH/BNB balance
    const nativeBal = await provider.getBalance(walletAddress);
    console.log(`Native Balance (${chainName}): ${ethers.formatEther(nativeBal)}`);

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "event Transfer(address indexed from, address indexed to, uint256 value)"
    ];

    const escrowAbi = [
        "function vaultBalances(address, address) view returns (uint256)",
        "function userBalances(address, address) view returns (uint256)"
    ];

    const escrowContract = new ethers.Contract(escrowAddress, escrowAbi, provider);

    for (const t of tokens) {
        if (!t.addr || t.addr === "0x0000000000000000000000000000000000000000") continue;
        const tokenContract = new ethers.Contract(t.addr, erc20Abi, provider);
        try {
            const decs = await tokenContract.decimals();
            const walletBal = await tokenContract.balanceOf(walletAddress);
            console.log(`Direct Wallet ${t.name}: ${ethers.formatUnits(walletBal, decs)}`);

            // Vault balance
            try {
                const vaultBal = await escrowContract.vaultBalances(walletAddress, t.addr);
                console.log(`Escrow Vault ${t.name}: ${ethers.formatUnits(vaultBal, decs)}`);
            } catch (err: any) {
                console.log(`Escrow Vault ${t.name}: read error (${err.message})`);
            }

            try {
                const userBal = await escrowContract.userBalances(walletAddress, t.addr);
                console.log(`Escrow User ${t.name}: ${ethers.formatUnits(userBal, decs)}`);
            } catch (err: any) {
                // ignore if not present
            }

            // Recent token transfer logs to/from walletAddress
            const currentBlock = await provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 100000); // approx last ~2-3 days on Base/BSC

            const filterIn = tokenContract.filters.Transfer(null, walletAddress);
            const logsIn = await tokenContract.queryFilter(filterIn, fromBlock, currentBlock);
            console.log(`Incoming ${t.name} Transfers (last 100k blocks): ${logsIn.length}`);
            for (const log of logsIn.slice(-5)) {
                const parsed = log as any;
                console.log(`  <- From ${parsed.args[0]} | Value: ${ethers.formatUnits(parsed.args[2], decs)} | Tx: ${log.transactionHash}`);
            }

            const filterOut = tokenContract.filters.Transfer(walletAddress, null);
            const logsOut = await tokenContract.queryFilter(filterOut, fromBlock, currentBlock);
            console.log(`Outgoing ${t.name} Transfers (last 100k blocks): ${logsOut.length}`);
            for (const log of logsOut.slice(-5)) {
                const parsed = log as any;
                console.log(`  -> To ${parsed.args[0]} | Value: ${ethers.formatUnits(parsed.args[2], decs)} | Tx: ${log.transactionHash}`);
            }

        } catch (e: any) {
            console.error(`Error querying ${t.name} on ${chainName}:`, e.message);
        }
    }
}

async function main() {
    await checkChain("base", env.BASE_RPC_URL, env.ESCROW_CONTRACT_ADDRESS, [
        { name: "USDC", addr: env.USDC_ADDRESS },
        { name: "USDT", addr: env.USDT_ADDRESS }
    ]);

    await checkChain("bsc", env.BSC_RPC_URL, env.ESCROW_CONTRACT_ADDRESS_BSC, [
        { name: "USDT", addr: "0x55d398326f99059fF775485246999027B3197955" },
        { name: "USDC", addr: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" }
    ]);
}

main().catch(console.error);
