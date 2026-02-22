export const ESCROW_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "deposit",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "withdraw",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "user", "type": "address" },
            { "internalType": "address", "name": "token", "type": "address" }
        ],
        "name": "balances",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const ERC20_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "spender", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "boolean", "name": "", "type": "boolean" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "address", "name": "owner", "type": "address" },
            { "internalType": "address", "name": "spender", "type": "address" }
        ],
        "name": "allowance",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

export const CONTRACTS = {
    base: {
        escrow: "0xf20872C359788a53958a048413D64F183403B1f1", // Using Legacy as requested
        tokens: {
            USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
        }
    },
    bsc: {
        escrow: "0x74EdacD5fEfFE2fb59b7b0942Ed99e49a3AB853A", // V2
        tokens: {
            USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
            USDT: "0x55d398326f99059fF775485246999027B3197955",
            BNB: "0x0000000000000000000000000000000000000000",
        }
    }
};

export const LEGACY_CONTRACTS = {
    base: {
        escrow: "0xf20872C359788a53958a048413D64F183403B1f1",
    },
    bsc: {
        escrow: "0xe9B4936673BDa2F4899225A0a82E2fdAF456eCA6",
    }
};
