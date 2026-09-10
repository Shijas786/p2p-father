import { ethers, JsonRpcProvider, Network } from "ethers";
import { env } from "../config/env";

// Alchemy key optionally loaded from env — never hardcoded in source
const ALCHEMY_KEY = process.env.ALCHEMY_KEY || "";
const alchemyRpc = (network: string) =>
    ALCHEMY_KEY ? `https://${network}.g.alchemy.com/v2/${ALCHEMY_KEY}` : null;

const BSC_RPCS = [
    alchemyRpc("bnb-mainnet"),
    "https://bsc-dataseed.binance.org",
    "https://bsc.publicnode.com",
    "https://bsc-dataseed1.defibit.io",
].filter(Boolean) as string[];

const BASE_RPCS = [
    alchemyRpc("base-mainnet"),
    "https://mainnet.base.org",
    "https://base-rpc.publicnode.com",
].filter(Boolean) as string[];

const POLYGON_RPCS = [
    alchemyRpc("polygon-mainnet"),
    "https://polygon.publicnode.com",
    "https://polygon-bor-rpc.publicnode.com",
].filter(Boolean) as string[];

const MAINNET_RPCS = [
    alchemyRpc("eth-mainnet"),
    "https://ethereum-rpc.publicnode.com",
    "https://eth.llamarpc.com",
].filter(Boolean) as string[];

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
    if (chain === 'polygon') return POLYGON_RPCS;
    if (chain === 'mainnet') return MAINNET_RPCS;
    return BASE_RPCS;
}

export function getChainId(chain: string = 'base'): number {
    if (chain === 'bsc') return 56;
    if (chain === 'bsc_testnet') return 97;
    if (chain === 'base_sepolia') return 84532;
    if (chain === 'polygon') return 137;
    if (chain === 'mainnet') return 1;
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
