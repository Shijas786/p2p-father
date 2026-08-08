const { ethers } = require('ethers');

const wallet = "0x2893757eA433B9D56A1792aB8e9A7aacabE9e787";
const rpc = "https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER";

// Escrow V2 ABI for decoding method calls
const ESCROW_ABI = [
  "function deposit(address token, uint256 amount)",
  "function withdraw(address token, uint256 amount)",
  "function createTrade(address token, uint256 amount, uint256 fiatAmount, address buyer)"
];
const iface = new ethers.Interface(ESCROW_ABI);

async function run() {
  const provider = new ethers.JsonRpcProvider(rpc);
  const count = await provider.getTransactionCount(wallet);
  console.log(`Total transactions sent by ${wallet}: ${count}`);

  // Fetch the latest block
  const latestBlock = await provider.getBlockNumber();

  // We can scan the transactions of the address.
  // Wait, JSON-RPC doesn't have an easy "get transactions by address" method directly unless we use an indexer,
  // but wait! Since the transaction count is 111, we can scan the blocks where the transactions were sent.
  // But wait, how do we know which blocks?
  // We can query the Bscscan website directly via curl to get the list of transaction hashes, or we can use another method.
  // Wait, let's see if we can get the transaction list using a simple fetch/curl to Bscscan's HTML list.
  // Let's check if the browser can give us the list of transactions from page 1.
  // Or, since we can just use curl to get Bscscan's transactions list!
  // Wait, does Bscscan block simple curl requests? Yes, usually they use Cloudflare.
  // But our browser page is active!
  // Let's run a browser subagent to get the transaction table rows and print them as JSON.
}
run();
