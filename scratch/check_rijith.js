const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');

const supabase = createClient(
  'https://demo-project.supabase.co',
  'SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER'
);

const userWallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";
const depositWallet = "0xD79D0f16e7f4806D2Ee8056a2C6d067AD2aeB761";
const userId = "de05c77a-cc39-4705-91a2-7c1ebbf9793d";

async function check() {
  console.log("=== Checking rijithpothan20 Balances ===");
  const providerBase = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const providerBsc = new ethers.JsonRpcProvider('https://bsc-dataseed.binance.org');

  const ESCROW_ABI = [{"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"address","name":"token","type":"address"}],"name":"balances","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];
  const escrowBase = new ethers.Contract("0xf20872C359788a53958a048413D64F183403B1f1", ESCROW_ABI, providerBase);
  const escrowBsc = new ethers.Contract("0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a", ESCROW_ABI, providerBsc);

  const ERC20_ABI = [{"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}];

  // Base Tokens
  const usdcBase = new ethers.Contract("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ERC20_ABI, providerBase);
  const usdtBase = new ethers.Contract("0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", ERC20_ABI, providerBase);

  // BSC Tokens
  const usdcBsc = new ethers.Contract("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", ERC20_ABI, providerBsc);
  const usdtBsc = new ethers.Contract("0x55d398326f99059fF775485246999027B3197955", ERC20_ABI, providerBsc);

  async function checkAddr(name, addr) {
    console.log(`\n--- Address: ${name} (${addr}) ---`);
    if (!addr) {
      console.log("No address configured.");
      return;
    }
    // Gas/Native Balance
    try {
      const baseGas = await providerBase.getBalance(addr);
      console.log(`Base Native (ETH): ${ethers.formatEther(baseGas)} ETH`);
    } catch(e) { console.log("Error Base Native:", e.message); }

    try {
      const bscGas = await providerBsc.getBalance(addr);
      console.log(`BSC Native (BNB): ${ethers.formatEther(bscGas)} BNB`);
    } catch(e) { console.log("Error BSC Native:", e.message); }

    // Wallet balances (liquid)
    try {
      const bUsdc = await usdcBase.balanceOf(addr);
      console.log(`Wallet USDC (Base): ${ethers.formatUnits(bUsdc, 6)} USDC`);
    } catch(e) { console.log("Error Wallet USDC Base:", e.message); }

    try {
      const bUsdt = await usdtBase.balanceOf(addr);
      console.log(`Wallet USDT (Base): ${ethers.formatUnits(bUsdt, 6)} USDT`);
    } catch(e) { console.log("Error Wallet USDT Base:", e.message); }

    try {
      const bUsdcB = await usdcBsc.balanceOf(addr);
      console.log(`Wallet USDC (BSC): ${ethers.formatUnits(bUsdcB, 18)} USDC`);
    } catch(e) { console.log("Error Wallet USDC BSC:", e.message); }

    try {
      const bUsdtB = await usdtBsc.balanceOf(addr);
      console.log(`Wallet USDT (BSC): ${ethers.formatUnits(bUsdtB, 18)} USDT`);
    } catch(e) { console.log("Error Wallet USDT BSC:", e.message); }

    // Escrow/Vault balances (locked/escrowed/deposited)
    try {
      const vUsdcBase = await escrowBase.balances(addr, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
      console.log(`Vault USDC (Base): ${ethers.formatUnits(vUsdcBase, 6)} USDC`);
    } catch(e) { console.log("Error Vault USDC Base:", e.message); }

    try {
      const vUsdtBase = await escrowBase.balances(addr, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2");
      console.log(`Vault USDT (Base): ${ethers.formatUnits(vUsdtBase, 6)} USDT`);
    } catch(e) { console.log("Error Vault USDT Base:", e.message); }

    try {
      const vUsdcBsc = await escrowBsc.balances(addr, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
      console.log(`Vault USDC (BSC): ${ethers.formatUnits(vUsdcBsc, 18)} USDC`);
    } catch(e) { console.log("Error Vault USDC BSC:", e.message); }

    try {
      const vUsdtBsc = await escrowBsc.balances(addr, "0x55d398326f99059fF775485246999027B3197955");
      console.log(`Vault USDT (BSC): ${ethers.formatUnits(vUsdtBsc, 18)} USDT`);
    } catch(e) { console.log("Error Vault USDT BSC:", e.message); }

    try {
      const vBnbBsc = await escrowBsc.balances(addr, "0x0000000000000000000000000000000000000000");
      console.log(`Vault BNB (BSC): ${ethers.formatUnits(vBnbBsc, 18)} BNB`);
    } catch(e) { console.log("Error Vault BNB BSC:", e.message); }
  }

  await checkAddr("Bot Wallet", userWallet);
  await checkAddr("Deposit Wallet (Polymarket CLOB proxy/deposit)", depositWallet);

  console.log("\n=== DB Trades for User (Last 10) ===");
  const { data: trades, error: te } = await supabase.from('trades')
    .select('id, status, token, chain, amount, rate, fiat_amount, fiat_currency, buyer_id, seller_id, created_at, updated_at')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(10);

  if (te) {
    console.error("Trades Error:", te.message);
  } else {
    trades.forEach(t => {
      const role = t.buyer_id === userId ? "BUYER" : "SELLER";
      console.log(`  - [${role}] Trade ${t.id} | Status: ${t.status} | ${t.amount} ${t.token} on ${t.chain} | Fiat: ${t.fiat_amount} ${t.fiat_currency} | Updated: ${t.updated_at}`);
    });
  }
}

check().catch(console.error);
