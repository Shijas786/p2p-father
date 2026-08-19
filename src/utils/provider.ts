import { ethers, JsonRpcProvider, Network } from "ethers";
import { env } from "../config/env";

const ALCHEMY_KEY_1 = "ALCHEMY_API_KEY_PLACEHOLDER"; // Full multi-chain enabled
const ALCHEMY_KEY_2 = "qMlL6xWpv9OsGOolPeTtR"; // Full multi-chain enabled
const ALCHEMY_KEY_3 = "alch_REDACTED"; // BSC, Base, Eth enabled

const BASE_RPCS = [
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_3}`,
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
].filter(Boolean);

const BSC_RPCS = [
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_3}`,
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://bsc.publicnode.com",
].filter(Boolean);

const BSC_TESTNET_RPCS = [
    "https://data-seed-prebsc-1-s1.binance.org:8545/",
    "https://data-seed-prebsc-2-s1.binance.org:8545/",
    "https://bsc-testnet.publicnode.com"
];

const BASE_SEPOLIA_RPCS = [
    "https://sepolia.base.org",
    "https://base-sepolia-rpc.publicnode.com"
];

const providerCache: Record<string, ethers.JsonRpcProvider> = {};

export function getRpcList(chain: string = 'base'): string[] {
    if (chain === 'bsc') return BSC_RPCS;
    if (chain === 'bsc_testnet') return BSC_TESTNET_RPCS;
    if (chain === 'base_sepolia') return BASE_SEPOLIA_RPCS;
    return BASE_RPCS;
}

export function getChainId(chain: string = 'base'): number {
    if (chain === 'bsc') return 56;
    if (chain === 'bsc_testnet') return 97;
    if (chain === 'base_sepolia') return 84532;
    return 8453;
}

/**
 * Creates a low-latency JsonRpcProvider with staticNetwork: true enabled.
 * Static network mode eliminates startup 'failed to detect network' errors completely.
 */
export function getFastProvider(chain: string = 'base', rpcIndex: number = 0): ethers.JsonRpcProvider {
    const chainId = getChainId(chain);
    const rpcList = getRpcList(chain);
    const primaryUrl = rpcList[rpcIndex % rpcList.length];
    const staticNet = Network.from(chainId);

    return new JsonRpcProvider(primaryUrl, staticNet, { staticNetwork: true });
}

export function getCachedProvider(chain: string = 'base'): ethers.JsonRpcProvider {
    if (!providerCache[chain]) {
        providerCache[chain] = getFastProvider(chain);
    }
    return providerCache[chain];
}
