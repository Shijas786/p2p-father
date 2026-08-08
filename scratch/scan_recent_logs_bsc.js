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
  // Scan last 50,000 blocks (~41 hours)
  const startBlock = latestBlock - 50000;
  console.log(`Latest block: ${latestBlock}, Scanning from: ${startBlock}`);

  const userTopic = ethers.zeroPadValue(userWallet, 32);

  async function getLogsChunked(filter) {
    const chunk = 5000;
    const all = [];
    let from = filter.fromBlock;
    while (from <= filter.toBlock) {
      const to = Math.min(filter.toBlock, from + chunk);
      await new Promise(r => setTimeout(r, 100)); // Sleep 100ms
      try {
        const logs = await provider.getLogs({
          ...filter,
          fromBlock: from,
          toBlock: to
        });
        all.push(...logs);
      } catch (err) {
        console.error(`Error ${from}-${to}: ${err.message}`);
      }
      from = to + 1;
    }
    return all;
  }

  console.log("\n=== Escrow Event History (BSC V2) ===");

  // 1. Deposits
  const depFilter = {
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [ethers.id("Deposit(address,address,uint256)"), userTopic]
  };
  const depLogs = await getLogsChunked(depFilter);
  console.log(`Deposits found: ${depLogs.length}`);
  for (const log of depLogs) {
    const parsed = escrow.interface.parseLog(log);
    const amount = ethers.formatUnits(parsed.args.amount, 18);
    console.log(`  [Deposit] ${amount} USDT | Block: ${log.blockNumber} | TX: ${log.transactionHash}`);
  }

  // 2. Withdraws
  const witFilter = {
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [ethers.id("Withdraw(address,address,uint256)"), userTopic]
  };
  const witLogs = await getLogsChunked(witFilter);
  console.log(`Withdrawals found: ${witLogs.length}`);
  for (const log of witLogs) {
    const parsed = escrow.interface.parseLog(log);
    const amount = ethers.formatUnits(parsed.args.amount, 18);
    console.log(`  [Withdraw] ${amount} USDT | Block: ${log.blockNumber} | TX: ${log.transactionHash}`);
  }

  // 3. TradeCreated as Seller
  const tcSellerFilter = {
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [
      ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)"),
      null,
      userTopic
    ]
  };
  const tcSellerLogs = await getLogsChunked(tcSellerFilter);
  console.log(`Trades Created as Seller: ${tcSellerLogs.length}`);
  for (const log of tcSellerLogs) {
    const parsed = escrow.interface.parseLog(log);
    const amount = ethers.formatUnits(parsed.args.amount, 18);
    console.log(`  [TradeCreated #${parsed.args.tradeId}] ${amount} USDT | Buyer: ${parsed.args.buyer} | Block: ${log.blockNumber} | TX: ${log.transactionHash}`);
  }

  // 4. TradeReleased where seller was user
  // (We need to check TradeReleased events. It has topics: TradeReleased(uint256,address,uint256,uint256). Buyer is indexed, seller is not.
  // So we'll fetch all TradeReleased events and filter by tradeId matching our trade list.)
  const trFilter = {
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [ethers.id("TradeReleased(uint256,address,uint256,uint256)")]
  };
  const trLogs = await getLogsChunked(trFilter);
  console.log(`Total Releases: ${trLogs.length}`);
  for (const log of trLogs) {
    const parsed = escrow.interface.parseLog(log);
    const buyerReceives = ethers.formatUnits(parsed.args.buyerReceives, 18);
    // Fetch transaction info to check if seller was user
    const tx = await provider.getTransaction(log.transactionHash);
    // Wait, let's just log it:
    console.log(`  [TradeReleased #${parsed.args.tradeId}] Released to Buyer: ${parsed.args.buyer} | Amount: ${buyerReceives} USDT | TX: ${log.transactionHash}`);
  }

  // 5. TradeRefunded where seller was user
  const tfFilter = {
    address: escrowAddress,
    fromBlock: startBlock,
    toBlock: latestBlock,
    topics: [
      ethers.id("TradeRefunded(uint256,address,uint256)"),
      null,
      userTopic
    ]
  };
  const tfLogs = await getLogsChunked(tfFilter);
  console.log(`Total Refunds as Seller: ${tfLogs.length}`);
  for (const log of tfLogs) {
    const parsed = escrow.interface.parseLog(log);
    const amount = ethers.formatUnits(parsed.args.amount, 18);
    console.log(`  [TradeRefunded #${parsed.args.tradeId}] Refunded to Seller: ${parsed.args.seller} | Amount: ${amount} USDT | TX: ${log.transactionHash}`);
  }
}

run().catch(console.error);
