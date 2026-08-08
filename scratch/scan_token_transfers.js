const { ethers } = require('ethers');

const userWallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";

const CONFIG = {
  base: {
    escrow: "0xf20872C359788a53958a048413D64F183403B1f1",
    tokens: [
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 },
      { address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", symbol: "USDT", decimals: 6 }
    ],
    rpc: "https://mainnet.base.org",
    chunkSize: 9000,
    maxBlocks: 1000000 // ~23 days
  },
  bsc: {
    escrow: "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a",
    tokens: [
      { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18 },
      { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 }
    ],
    rpc: "https://bsc-dataseed.binance.org",
    chunkSize: 9000,
    maxBlocks: 1000000 // ~34 days
  }
};

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const ESCROW_ABI = [
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event Withdraw(address indexed user, address indexed token, uint256 amount)"
];

async function scan(chain) {
  console.log(`\n================ SCANNING ${chain.toUpperCase()} ================`);
  const c = CONFIG[chain];
  const provider = new ethers.JsonRpcProvider(c.rpc);
  const latestBlock = await provider.getBlockNumber();
  const startBlock = Math.max(0, latestBlock - c.maxBlocks);
  console.log(`Latest block: ${latestBlock}, Scanning from: ${startBlock}`);

  const userTopic = ethers.zeroPadValue(userWallet, 32);

  // Helper to chunk getLogs
  async function getLogsChunked(filter) {
    const allLogs = [];
    let curFrom = filter.fromBlock;
    while (curFrom <= filter.toBlock) {
      const curTo = Math.min(filter.toBlock, curFrom + c.chunkSize);
      // Wait 100ms between calls to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 100));
      try {
        const chunkLogs = await provider.getLogs({
          ...filter,
          fromBlock: curFrom,
          toBlock: curTo
        });
        allLogs.push(...chunkLogs);
      } catch (err) {
        console.error(`Error querying blocks ${curFrom} - ${curTo}: ${err.message}`);
        // If it's a size limit, try half-sized chunks recursively or log
      }
      curFrom = curTo + 1;
    }
    return allLogs;
  }

  // 1. Scan direct incoming transfers of tokens to the wallet
  console.log("\n--- Direct Incoming Token Transfers to Bot Wallet ---");
  for (const t of c.tokens) {
    const filter = {
      address: t.address,
      fromBlock: startBlock,
      toBlock: latestBlock,
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        null,
        userTopic
      ]
    };
    try {
      const logs = await getLogsChunked(filter);
      console.log(`Found ${logs.length} transfers for ${t.symbol}.`);
      for (const log of logs) {
        const parsed = new ethers.Interface(ERC20_ABI).parseLog(log);
        const amount = ethers.formatUnits(parsed.args.value, t.decimals);
        const block = await provider.getBlock(log.blockNumber);
        const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
        console.log(`  [Transfer] From: ${parsed.args.from} | ${amount} ${t.symbol} | TX: ${log.transactionHash} | Time: ${date}`);
      }
    } catch(e) {
      console.error(`Error scanning transfers for ${t.symbol}:`, e.message);
    }
  }

  // 2. Scan Deposits to the Escrow contract
  console.log("\n--- Escrow Contract Deposits ---");
  try {
    const filter = {
      address: c.escrow,
      fromBlock: startBlock,
      toBlock: latestBlock,
      topics: [
        ethers.id("Deposit(address,address,uint256)"),
        userTopic
      ]
    };
    const logs = await getLogsChunked(filter);
    console.log(`Found ${logs.length} Deposit events.`);
    for (const log of logs) {
      const parsed = new ethers.Interface(ESCROW_ABI).parseLog(log);
      const token = c.tokens.find(t => t.address.toLowerCase() === parsed.args.token.toLowerCase()) || { symbol: parsed.args.token, decimals: 18 };
      const amount = ethers.formatUnits(parsed.args.amount, token.decimals);
      const block = await provider.getBlock(log.blockNumber);
      const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
      console.log(`  [Escrow Deposit] ${amount} ${token.symbol} | TX: ${log.transactionHash} | Time: ${date}`);
    }
  } catch(e) {
    console.error("Error scanning escrow deposits:", e.message);
  }

  // 3. Scan Withdrawals from the Escrow contract
  console.log("\n--- Escrow Contract Withdrawals ---");
  try {
    const filter = {
      address: c.escrow,
      fromBlock: startBlock,
      toBlock: latestBlock,
      topics: [
        ethers.id("Withdraw(address,address,uint256)"),
        userTopic
      ]
    };
    const logs = await getLogsChunked(filter);
    console.log(`Found ${logs.length} Withdraw events.`);
    for (const log of logs) {
      const parsed = new ethers.Interface(ESCROW_ABI).parseLog(log);
      const token = c.tokens.find(t => t.address.toLowerCase() === parsed.args.token.toLowerCase()) || { symbol: parsed.args.token, decimals: 18 };
      const amount = ethers.formatUnits(parsed.args.amount, token.decimals);
      const block = await provider.getBlock(log.blockNumber);
      const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
      console.log(`  [Escrow Withdraw] ${amount} ${token.symbol} | TX: ${log.transactionHash} | Time: ${date}`);
    }
  } catch(e) {
    console.error("Error scanning escrow withdrawals:", e.message);
  }
}

async function run() {
  await scan("bsc");
  await scan("base");
}

run().catch(console.error);
