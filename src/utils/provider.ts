import { ethers, JsonRpcProvider, Network } from "ethers";
import { env } from "../config/env";

const ALCHEMY_KEY_1 = "ALCHEMY_API_KEY_PLACEHOLDER";
const ALCHEMY_KEY_2 = "alch_REDACTED";

const BASE_RPCS = [
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
].filter(Boolean);

const BSC_RPCS = [
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
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

/**
 * Creates a low-latency JsonRpcProvider with staticNetwork: true enabled.
 * Static network mode eliminates startup 'failed to detect network' errors completely.
 */
export function getFastProvider(chain: string = 'base'): ethers.JsonRpcProvider {
    if (providerCache[chain]) {
        return providerCache[chain];
    }

    let chainId = 8453;
    let rpcList = BASE_RPCS;

    if (chain === 'bsc') {
        chainId = 56;
        rpcList = BSC_RPCS;
    } else if (chain === 'bsc_testnet') {
        chainId = 97;
        rpcList = BSC_TESTNET_RPCS;
    } else if (chain === 'base_sepolia') {
        chainId = 84532;
        rpcList = BASE_SEPOLIA_RPCS;
    }

    const primaryUrl = rpcList[0];
    const staticNet = Network.from(chainId);

    const provider = new JsonRpcProvider(primaryUrl, staticNet, { staticNetwork: true });
    providerCache[chain] = provider;
    return provider;
}
