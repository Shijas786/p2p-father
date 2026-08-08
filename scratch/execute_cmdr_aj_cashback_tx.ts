import { sendCashbackOnChain } from "../src/services/feeCashbackService";

async function main() {
    console.log("=== Executing 0.025 USDT On-Chain Cashback Transfer for @vip_trader ===");
    const cmdrAjWallet = "0xb5B76E0E0a0544eCAee4a012E6fcA71B6A9ec9A2";
    const amount = 0.025; // 0.25% of 10 USDT
    
    const txHash = await sendCashbackOnChain('bsc', 'USDT', cmdrAjWallet, amount);
    console.log("Result Tx Hash:", txHash);
}

main().catch(console.error);
