require('dotenv').config();
const { ethers } = require('ethers');

// Mock environments
const env = {
  USDC_ADDRESS: process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT_ADDRESS: process.env.USDT_ADDRESS || "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
};

const providers = {
  base: new ethers.JsonRpcProvider('https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
  bsc: new ethers.JsonRpcProvider('https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
  polygon: new ethers.JsonRpcProvider('https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')
};

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

const ESCROW_ABI = [
  "function balances(address user, address token) view returns (uint256)"
];

const escrows = {
  base: new ethers.Contract("0xf20872C359788a53958a048413D64F183403B1f1", ESCROW_ABI, providers.base),
  bsc: new ethers.Contract("0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a", ESCROW_ABI, providers.bsc)
};

async function getTokenBalance(address, tokenAddress, chain) {
  if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
    const bal = await providers[chain].getBalance(address);
    return ethers.formatEther(bal);
  }
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, providers[chain]);
  try {
    const bal = await contract.balanceOf(address);
    const dec = await contract.decimals();
    return ethers.formatUnits(bal, dec);
  } catch (err) {
    console.error(`getTokenBalance failed for ${tokenAddress} on ${chain}:`, err.message);
    throw err;
  }
}

async function getVaultBalance(address, tokenAddress, chain) {
  const escrow = escrows[chain];
  try {
    const bal = await escrow.balances(address, tokenAddress);
    // Find decimals
    let dec = 18;
    if (chain === 'base') {
      dec = 6; // USDC & USDT have 6 decimals on Base
    } else {
      // BSC tokens
      if (tokenAddress.toLowerCase() === "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d" || tokenAddress.toLowerCase() === "0x55d398326f99059ff775485246999027b3197955") {
        dec = 18; // USDC and USDT have 18 decimals on BSC
      }
    }
    return ethers.formatUnits(bal, dec);
  } catch (err) {
    console.error(`getVaultBalance failed for ${tokenAddress} on ${chain}:`, err.message);
    throw err;
  }
}

const user = '0x2893757eA433B9D56A1792aB8e9A7aacabE9e787';

async function run() {
  console.log("Starting backend balances simulation for Rijith...");
  try {
    const ethBal = await providers.base.getBalance(user);
    console.log("Base ETH:", ethers.formatEther(ethBal));

    const usdcBal = await getTokenBalance(user, env.USDC_ADDRESS, 'base');
    console.log("Base USDC:", usdcBal);

    const usdtBal = await getTokenBalance(user, env.USDT_ADDRESS, 'base');
    console.log("Base USDT:", usdtBal);

    const bnbBal = await providers.bsc.getBalance(user);
    console.log("BSC BNB:", ethers.formatEther(bnbBal));

    const bscUsdcBal = await getTokenBalance(user, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc');
    console.log("BSC USDC:", bscUsdcBal);

    const bscUsdtBal = await getTokenBalance(user, "0x55d398326f99059fF775485246999027B3197955", 'bsc');
    console.log("BSC USDT:", bscUsdtBal);

    const polBal = await providers.polygon.getBalance(user);
    console.log("Polygon POL:", ethers.formatEther(polBal));

    const pusdBal = await getTokenBalance(user, "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB", 'polygon');
    console.log("Polygon pUSD:", pusdBal);

    const vaultBaseUsdc = await getVaultBalance(user, env.USDC_ADDRESS, 'base');
    console.log("Vault Base USDC:", vaultBaseUsdc);

    const vaultBaseUsdt = await getVaultBalance(user, env.USDT_ADDRESS, 'base');
    console.log("Vault Base USDT:", vaultBaseUsdt);

    const vaultBscBnb = await getVaultBalance(user, "0x0000000000000000000000000000000000000000", 'bsc');
    console.log("Vault BSC BNB:", vaultBscBnb);

    const vaultBscUsdc = await getVaultBalance(user, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 'bsc');
    console.log("Vault BSC USDC:", vaultBscUsdc);

    const vaultBscUsdt = await getVaultBalance(user, "0x55d398326f99059fF775485246999027B3197955", 'bsc');
    console.log("Vault BSC USDT:", vaultBscUsdt);

    console.log("=== Simulation Complete: Success ===");
  } catch (e) {
    console.error("=== Simulation Failed with Error ===");
    console.error(e);
  }
}

run();
