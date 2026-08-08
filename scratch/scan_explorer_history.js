const https = require('https');

const wallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";
const apikey = "BSCSCAN_KEY_REDACTED";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

const fmtDate = (ts) => new Date(parseInt(ts) * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

async function run() {
  console.log(`=== Explorer Scan for: ${wallet} ===\n`);

  // --- 1. BSC Token Transfers (BEP-20) ---
  console.log("--- BSC Token Transfers (Last 50) ---");
  const bscTokenUrl = `https://api.bscscan.com/api?module=account&action=tokentx&address=${wallet}&apikey=${apikey}&sort=desc&page=1&offset=50`;
  try {
    const res = await fetchJson(bscTokenUrl);
    if (res.status === "1" && res.result) {
      res.result.forEach(tx => {
        const val = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
        const dir = tx.to.toLowerCase() === wallet.toLowerCase() ? "IN 📥" : "OUT 📤";
        console.log(`  [BSC BEP20] [${dir}] ${val} ${tx.tokenSymbol} | From: ${tx.from.substring(0,8)}... | To: ${tx.to.substring(0,8)}... | Date: ${fmtDate(tx.timeStamp)} | TX: ${tx.hash}`);
      });
    } else {
      console.log("  No BEP20 transfers found or error:", res.message);
    }
  } catch(e) {
    console.error("  Error BEP20:", e.message);
  }

  // --- 2. Base Token Transfers (ERC-20) ---
  console.log("\n--- Base Token Transfers (Last 50) ---");
  const baseTokenUrl = `https://api.basescan.org/api?module=account&action=tokentx&address=${wallet}&apikey=${apikey}&sort=desc&page=1&offset=50`;
  try {
    const res = await fetchJson(baseTokenUrl);
    if (res.status === "1" && res.result) {
      res.result.forEach(tx => {
        const val = parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal));
        const dir = tx.to.toLowerCase() === wallet.toLowerCase() ? "IN 📥" : "OUT 📤";
        console.log(`  [Base ERC20] [${dir}] ${val} ${tx.tokenSymbol} | From: ${tx.from.substring(0,8)}... | To: ${tx.to.substring(0,8)}... | Date: ${fmtDate(tx.timeStamp)} | TX: ${tx.hash}`);
      });
    } else {
      console.log("  No ERC20 transfers found or error:", res.message);
    }
  } catch(e) {
    console.error("  Error ERC20:", e.message);
  }

  // --- 3. BSC Normal Transactions (to see contract deposit/withdraw executions) ---
  console.log("\n--- BSC Normal Transactions (Last 50) ---");
  const bscNormalUrl = `https://api.bscscan.com/api?module=account&action=txlist&address=${wallet}&apikey=${apikey}&sort=desc&page=1&offset=50`;
  try {
    const res = await fetchJson(bscNormalUrl);
    if (res.status === "1" && res.result) {
      res.result.forEach(tx => {
        const isEscrow = tx.to.toLowerCase() === "0x9f4ab356cf973a6a5ad7d5a826d04e29861c502a" ? "ESCROW CONTRACT" : tx.to.substring(0,10);
        console.log(`  [BSC Tx] To: ${isEscrow} | Value: ${parseFloat(tx.value)/1e18} BNB | Method: ${tx.functionName || 'Transfer/Direct'} | Date: ${fmtDate(tx.timeStamp)} | TX: ${tx.hash} (Status: ${tx.txreceipt_status === "1" ? "Success" : "Failed"})`);
      });
    } else {
      console.log("  No normal BSC transactions found.");
    }
  } catch(e) {
    console.error("  Error BSC normal:", e.message);
  }

  // --- 4. Base Normal Transactions ---
  console.log("\n--- Base Normal Transactions (Last 50) ---");
  const baseNormalUrl = `https://api.basescan.org/api?module=account&action=txlist&address=${wallet}&apikey=${apikey}&sort=desc&page=1&offset=50`;
  try {
    const res = await fetchJson(baseNormalUrl);
    if (res.status === "1" && res.result) {
      res.result.forEach(tx => {
        const isEscrow = tx.to.toLowerCase() === "0xf20872c359788a53958a048413d64f183403b1f1" ? "ESCROW CONTRACT" : tx.to.substring(0,10);
        console.log(`  [Base Tx] To: ${isEscrow} | Value: ${parseFloat(tx.value)/1e18} ETH | Method: ${tx.functionName || 'Transfer/Direct'} | Date: ${fmtDate(tx.timeStamp)} | TX: ${tx.hash} (Status: ${tx.txreceipt_status === "1" ? "Success" : "Failed"})`);
      });
    } else {
      console.log("  No normal Base transactions found.");
    }
  } catch(e) {
    console.error("  Error Base normal:", e.message);
  }
}

run().catch(console.error);
