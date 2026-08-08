const { ethers } = require('ethers');

const escrowAddress = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const rpc = "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";

const ESCROW_ABI = [
  "event TradeCreated(uint256 indexed tradeId, address indexed seller, address indexed buyer, address token, uint256 amount, uint256 feeAmount, uint256 deadline)"
];

async function run() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);

  const blocks = [109492568, 109492629, 109492874];

  for (const bNum of blocks) {
    console.log(`\nFetching block ${bNum} logs...`);
    try {
      // We can query logs for exactly that 1 block! Since the block range is 0 blocks (fromBlock = toBlock = bNum), it is well within the 10 block range!
      const logs = await provider.getLogs({
        address: escrowAddress,
        fromBlock: bNum,
        toBlock: bNum,
        topics: [ethers.id("TradeCreated(uint256,address,address,address,uint256,uint256,uint256)")]
      });
      console.log(`Found ${logs.length} TradeCreated events in block ${bNum}:`);
      for (const log of logs) {
        const parsed = escrow.interface.parseLog(log);
        console.log(`  Trade #${parsed.args.tradeId.toString()}:`);
        console.log(`    TX Hash: ${log.transactionHash}`);
        console.log(`    Seller: ${parsed.args.seller}`);
        console.log(`    Buyer: ${parsed.args.buyer}`);
        console.log(`    Amount: ${ethers.formatUnits(parsed.args.amount, 18)} USDT`);
      }
    } catch (err) {
      console.error(`Error for block ${bNum}:`, err.message);
    }
  }
}

run().catch(console.error);
