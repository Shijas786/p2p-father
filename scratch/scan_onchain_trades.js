const { ethers } = require('ethers');

const escrowAddress = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const rpc = "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const user = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";

const ESCROW_ABI = [
  "function tradeCounter() view returns (uint256)",
  "function trades(uint256) view returns (address seller, address buyer, address token, uint256 amount, uint256 feeAmount, uint256 buyerReceives, uint8 status, uint256 createdAt, uint256 deadline, uint256 fiatSentAt, address disputeInitiator)"
];

const statusNames = ["Active", "FiatSent", "Completed", "Cancelled", "Refunded", "Disputed"];

async function run() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);

  const counter = await escrow.tradeCounter();
  console.log(`Current on-chain tradeCounter: ${counter.toString()}`);

  console.log(`\nChecking the last 30 on-chain trades...`);
  const start = Math.max(1, Number(counter) - 30);
  const end = Number(counter);

  for (let id = end; id >= start; id--) {
    try {
      const trade = await escrow.trades(id);
      if (trade.seller.toLowerCase() === user.toLowerCase()) {
        console.log(`  On-Chain Trade #${id}:`);
        console.log(`    Buyer: ${trade.buyer}`);
        console.log(`    Amount: ${ethers.formatUnits(trade.amount, 18)} USDT`);
        console.log(`    Status: ${statusNames[trade.status]} (${trade.status})`);
        console.log(`    Created At: ${new Date(Number(trade.createdAt) * 1000).toLocaleString()}`);
        console.log(`    Deadline: ${new Date(Number(trade.deadline) * 1000).toLocaleString()}`);
      }
    } catch (err) {
      console.error(`Failed to fetch trade #${id}:`, err.message);
    }
  }
}

run().catch(console.error);
