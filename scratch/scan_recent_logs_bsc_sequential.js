const { ethers } = require('ethers');

const userWallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";
const escrowAddress = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const rpc = "https://bsc-dataseed.binance.org";

const ESCROW_ABI = [
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event Withdraw(address indexed user, address indexed token, uint256 amount)",
  "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)",
  "event TradeReleased(uint256 indexed tradeId, address indexed buyer, uint256 buyerReceives, uint256 feeAmount)",
  "event TradeRefunded(uint256 indexed tradeId, address indexed seller, uint256 amount)"
];

async function run() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);

  const latestBlock = await provider.getBlockNumber();
  const startBlock = latestBlock - 50000;
  console.log(`Latest block: ${latestBlock}, Scanning from: ${startBlock}`);

  const userTopic = ethers.zeroPadValue(userWallet, 32);

  // Helper to query sequentially with a 500ms delay between calls
  async function queryLogsSequentially(filter) {
    const chunk = 5000;
    const all = [];
    let from = filter.fromBlock;
    while (from <= filter.toBlock) {
      const to = Math.min(filter.toBlock, from + chunk);
      try {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: from,
          toBlock: to
        });
        all.push(...logs);
      } catch (err) {
        console.error(`Error querying ${from} - ${to}: ${err.message}`);
      }
      from = to + 1;
      // Sleep to prevent rate limit
      await new Promise(r => setTimeout(r, 300));
    }
    return all;
  }

  // 1. Deposits
  console.log("\n--- Deposits ---");
  const depLogs = await queryLogsSequentially({
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [ethers.id("Deposit(address,address,uint256)"), userTopic]
  });
  console.log(`Found ${depLogs.length} deposits.`);
  for (const log of depLogs) {
    const parsed = escrow.interface.parseLog(log);
    console.log(`  Deposit: ${ethers.formatUnits(parsed.args.amount, 18)} USDT | TX: ${log.transactionHash} | Block: ${log.blockNumber}`);
  }

  // 2. Withdrawals
  console.log("\n--- Withdrawals ---");
  const witLogs = await queryLogsSequentially({
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [ethers.id("Withdraw(address,address,uint256)"), userTopic]
  });
  console.log(`Found ${witLogs.length} withdrawals.`);
  for (const log of witLogs) {
    const parsed = escrow.interface.parseLog(log);
    console.log(`  Withdraw: ${ethers.formatUnits(parsed.args.amount, 18)} USDT | TX: ${log.transactionHash} | Block: ${log.blockNumber}`);
  }

  // 3. TradeCreated
  console.log("\n--- Trades Created as Seller ---");
  const tcLogs = await queryLogsSequentially({
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [
      ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)"),
      null,
      userTopic
    ]
  });
  console.log(`Found ${tcLogs.length} trades created as seller.`);
  for (const log of tcLogs) {
    const parsed = escrow.interface.parseLog(log);
    console.log(`  TradeCreated #${parsed.args.tradeId}: ${ethers.formatUnits(parsed.args.amount, 18)} USDT to Buyer ${parsed.args.buyer} | TX: ${log.transactionHash}`);
  }

  // 4. TradeRefunded
  console.log("\n--- Trade Refunds as Seller ---");
  const trLogs = await queryLogsSequentially({
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [
      ethers.id("TradeRefunded(uint256,address,uint256)"),
      null,
      userTopic
    ]
  });
  console.log(`Found ${trLogs.length} trade refunds.`);
  for (const log of trLogs) {
    const parsed = escrow.interface.parseLog(log);
    console.log(`  TradeRefunded #${parsed.args.tradeId}: ${ethers.formatUnits(parsed.args.amount, 18)} USDT | TX: ${log.transactionHash}`);
  }
}

run().catch(console.error);
