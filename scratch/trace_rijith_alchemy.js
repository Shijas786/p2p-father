const { ethers } = require('ethers');

const userWallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";

const CONTRACTS = {
  base: {
    escrow: "0xf20872C359788a53958a048413D64F183403B1f1",
    tokens: {
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": { symbol: "USDC", decimals: 6 },
      "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2": { symbol: "USDT", decimals: 6 }
    },
    rpc: "https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"
  },
  bsc: {
    escrow: "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a",
    tokens: {
      "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": { symbol: "USDC", decimals: 18 },
      "0x55d398326f99059fF775485246999027B3197955": { symbol: "USDT", decimals: 18 },
      "0x0000000000000000000000000000000000000000": { symbol: "BNB", decimals: 18 }
    },
    rpc: "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"
  }
};

const ESCROW_ABI = [
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event Withdraw(address indexed user, address indexed token, uint256 amount)",
  "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
  "event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)",
  "event TradeRefunded(uint256 indexed tradeId, address indexed seller, uint256 amount)"
];

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

async function scanChain(chainName) {
  console.log(`\n=== Scanning ${chainName.toUpperCase()} ===`);
  const config = CONTRACTS[chainName];
  const provider = new ethers.JsonRpcProvider(config.rpc);
  const escrow = new ethers.Contract(config.escrow, ESCROW_ABI, provider);

  const latestBlock = await provider.getBlockNumber();
  // Scan back 500,000 blocks (~17 days on BSC, ~11 days on Base)
  const startBlock = Math.max(0, latestBlock - 500000);
  console.log(`Scanning from block ${startBlock} to ${latestBlock}...`);

  const userTopic = ethers.zeroPadValue(userWallet, 32);

  // Helper to query logs in chunks of 50k blocks
  async function queryLogs(filter) {
    const chunk = 50000;
    let results = [];
    let from = filter.fromBlock;
    while (from <= filter.toBlock) {
      const to = Math.min(filter.toBlock, from + chunk);
      try {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: from,
          toBlock: to
        });
        results.push(...logs);
      } catch (err) {
        console.error(`Chunk ${from} - ${to} failed: ${err.message}`);
      }
      from = to + 1;
    }
    return results;
  }

  // 1. Deposits to Escrow
  console.log("\n--- Escrow Deposits ---");
  try {
    const filter = {
      address: config.escrow,
      fromBlock: startBlock,
      toBlock: latestBlock,
      topics: [
        ethers.id("Deposit(address,address,uint256)"),
        userTopic
      ]
    };
    const logs = await queryLogs(filter);
    console.log(`Found ${logs.length} deposit events.`);
    for (const log of logs) {
      const parsed = escrow.interface.parseLog(log);
      const tokenAddr = parsed.args.token.toLowerCase();
      const token = config.tokens[parsed.args.token] || config.tokens[tokenAddr] || { symbol: parsed.args.token, decimals: 18 };
      const amount = ethers.formatUnits(parsed.args.amount, token.decimals);
      const block = await provider.getBlock(log.blockNumber);
      const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
      console.log(`  [Deposit] ${amount} ${token.symbol} | TX: ${log.transactionHash} | Time: ${date}`);
    }
  } catch(e) {
    console.error("Error deposits:", e.message);
  }

  // 2. Withdraws from Escrow
  console.log("\n--- Escrow Withdrawals ---");
  try {
    const filter = {
      address: config.escrow,
      fromBlock: startBlock,
      toBlock: latestBlock,
      topics: [
        ethers.id("Withdraw(address,address,uint256)"),
        userTopic
      ]
    };
    const logs = await queryLogs(filter);
    console.log(`Found ${logs.length} withdrawal events.`);
    for (const log of logs) {
      const parsed = escrow.interface.parseLog(log);
      const tokenAddr = parsed.args.token.toLowerCase();
      const token = config.tokens[parsed.args.token] || config.tokens[tokenAddr] || { symbol: parsed.args.token, decimals: 18 };
      const amount = ethers.formatUnits(parsed.args.amount, token.decimals);
      const block = await provider.getBlock(log.blockNumber);
      const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
      console.log(`  [Withdraw] ${amount} ${token.symbol} | TX: ${log.transactionHash} | Time: ${date}`);
    }
  } catch(e) {
    console.error("Error withdrawals:", e.message);
  }

  // 3. Incoming token transfers to bot wallet
  console.log("\n--- Direct Incoming Token Transfers ---");
  for (const tokenAddr in config.tokens) {
    if (tokenAddr === "0x0000000000000000000000000000000000000000") continue;
    const tokenInfo = config.tokens[tokenAddr];
    try {
      const filter = {
        address: tokenAddr,
        fromBlock: startBlock,
        toBlock: latestBlock,
        topics: [
          ethers.id("Transfer(address,address,uint256)"),
          null,
          userTopic
        ]
      };
      const logs = await queryLogs(filter);
      console.log(`Found ${logs.length} transfers for ${tokenInfo.symbol}.`);
      for (const log of logs) {
        const parsed = new ethers.Interface(ERC20_ABI).parseLog(log);
        const amount = ethers.formatUnits(parsed.args.value, tokenInfo.decimals);
        const block = await provider.getBlock(log.blockNumber);
        const date = block ? new Date(block.timestamp * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'unknown';
        console.log(`  [Transfer] ${amount} ${tokenInfo.symbol} from ${parsed.args.from} | TX: ${log.transactionHash} | Time: ${date}`);
      }
    } catch(e) {
      console.error(`Error transfers for ${tokenInfo.symbol}:`, e.message);
    }
  }
}

async function run() {
  await scanChain("bsc");
  await scanChain("base");
}

run().catch(console.error);
