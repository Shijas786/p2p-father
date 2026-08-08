const { ethers } = require('ethers');

const escrowAddress = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const rpc = "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const relayerAddress = "0x3A5668F8B3E167771d503F0321c42a7B082789Ef";

const ESCROW_ABI = [
  "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)"
];

async function run() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);

  console.log("Scanning block range 109492000 - 109493200 for TradeCreated events...");
  const logs = await provider.getLogs({
    address: escrowAddress,
    fromBlock: 109492000,
    toBlock: 109493200,
    topics: [ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)")]
  });

  console.log(`Found ${logs.length} TradeCreated events:`);
  for (const log of logs) {
    const parsed = escrow.interface.parseLog(log);
    console.log(`  Trade #${parsed.args.tradeId.toString()}:`);
    console.log(`    TX Hash: ${log.transactionHash}`);
    console.log(`    Block: ${log.blockNumber}`);
    console.log(`    Seller: ${parsed.args.seller}`);
    console.log(`    Buyer: ${parsed.args.buyer}`);
    console.log(`    Amount: ${ethers.formatUnits(parsed.args.amount, 18)} USDT`);
  }
}

run().catch(console.error);
