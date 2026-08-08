const { ethers } = require('ethers');
require('dotenv').config();

const escrowAddress = "0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a";
const rpc = "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";
const relayerKey = process.env.RELAYER_PRIVATE_KEY;

const ESCROW_ABI = [
  "function approvedRelayers(address) view returns (bool)",
  "function refund(uint256 _tradeId) external",
  "function trades(uint256) view returns (address seller, uint8 status, uint32 createdAt, uint32 deadline, address buyer, uint32 fiatSentAt, address token, address disputeInitiator, uint256 amount, uint256 feeAmount, uint256 buyerReceives)"
];

async function run() {
  if (!relayerKey) {
    console.error("Missing RELAYER_PRIVATE_KEY in environment!");
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const relayerWallet = new ethers.Wallet(relayerKey, provider);
  console.log(`Relayer address: ${relayerWallet.address}`);

  const escrow = new ethers.Contract(escrowAddress, ESCROW_ABI, relayerWallet);

  const tradeIds = [263, 264, 265];

  for (const tradeId of tradeIds) {
    console.log(`\nProcessing Trade #${tradeId}...`);
    try {
      const trade = await escrow.trades(tradeId);
      console.log(`  Seller: ${trade.seller}`);
      console.log(`  Buyer: ${trade.buyer}`);
      console.log(`  Status (at index 1): ${trade.status}`); // wait, in our ABI definition status is at index 1 in tuple
      
      // Let's call using raw index to verify Active status
      const rawTrade = await provider.call({
        to: escrowAddress,
        data: escrow.interface.encodeFunctionData("trades", [tradeId])
      });
      const decoded = escrow.interface.decodeFunctionResult("trades", rawTrade);
      const status = decoded[1].toString(); // index 1 is status
      const amount = decoded[8]; // index 8 is amount
      
      console.log(`  Decoded status: ${status}`);
      console.log(`  Amount: ${ethers.formatUnits(amount, 18)} USDT`);

      if (Number(status) !== 1) {
        console.log(`  Trade #${tradeId} is not Active (status ${status}). Skipping.`);
        continue;
      }

      console.log(`  Sending refund transaction for #${tradeId}...`);
      const tx = await escrow.refund(tradeId);
      console.log(`  Transaction sent! Hash: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  Transaction confirmed in block ${receipt.blockNumber}!`);
    } catch (err) {
      console.error(`  Error processing Trade #${tradeId}:`, err.message);
    }
  }
  console.log("\nAll processed!");
}

run().catch(console.error);
