// Supported chains configuration
export interface ChainConfig {
    id: number;
    name: string;
    shortName: string;
    rpcUrl: string;
    explorerUrl: string;
    usdcAddress: string;
    isTestnet: boolean;
}

export const CHAINS: Record<string, ChainConfig> = {
    base: {
        id: 8453,
        name: "Base",
        shortName: "base",
        rpcUrl: "https://mainnet.base.org",
        explorerUrl: "https://basescan.org",
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        isTestnet: false,
    },
    "base-sepolia": {
        id: 84532,
        name: "Base Sepolia",
        shortName: "base-sepolia",
        rpcUrl: "https://sepolia.base.org",
        explorerUrl: "https://sepolia.basescan.org",
        usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        isTestnet: true,
    },
    ethereum: {
        id: 1,
        name: "Ethereum",
        shortName: "eth",
        rpcUrl: "https://eth.llamarpc.com",
        explorerUrl: "https://etherscan.io",
        usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        isTestnet: false,
    },
    arbitrum: {
        id: 42161,
        name: "Arbitrum",
        shortName: "arb",
        rpcUrl: "https://arb1.arbitrum.io/rpc",
        explorerUrl: "https://arbiscan.io",
        usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        isTestnet: false,
    },
    polygon: {
        id: 137,
        name: "Polygon",
        shortName: "pol",
        rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com",
        explorerUrl: "https://polygonscan.com",
        usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        isTestnet: false,
    },
    optimism: {
        id: 10,
        name: "Optimism",
        shortName: "op",
        rpcUrl: "https://mainnet.optimism.io",
        explorerUrl: "https://optimistic.etherscan.io",
        usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        isTestnet: false,
    },
};

export function getChain(nameOrId: string | number): ChainConfig | undefined {
    if (typeof nameOrId === "number") {
        return Object.values(CHAINS).find((c) => c.id === nameOrId);
    }
    return CHAINS[nameOrId.toLowerCase()];
}
