import { ethers, JsonRpcProvider, FallbackProvider, Network } from "ethers";
import { env } from "../config/env";

const BASE_RPC_FALLBACKS = [
    "https://rpc.ankr.com/base",
    "https://base-rpc.publicnode.com",
    "https://api.zan.top/base-mainnet",
    env.BASE_RPC_URL,
    "https://mainnet.base.org",
    "https://1rpc.io/base",
    "https://base-mainnet.public.blastapi.io"
].filter((url, i, self) => url && self.indexOf(url) === i);

const BSC_RPC_FALLBACKS = [
    env.BSC_RPC_URL,
    "https://rpc.ankr.com/bsc",
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://1rpc.io/bnb"
].filter((url, i, self) => url && self.indexOf(url) === i);

// Cache provider instances per chain
const providerCache: Record<string, ethers.Provider> = {};

/**
 * Creates a high-throughput, low-latency Multi-RPC Provider with static network caching
 * to eliminate extra eth_chainId roundtrip latencies.
 */
export function getFastProvider(chain: 'base' | 'bsc' | string = 'base'): ethers.Provider {
    if (providerCache[chain]) {
        return providerCache[chain];
    }

    const chainId = chain === 'base' ? 8453 : (chain === 'bsc' ? 56 : 1);
    const urls = chain === 'base' 
        ? BASE_RPC_FALLBACKS 
        : (chain === 'bsc' ? BSC_RPC_FALLBACKS : [env.BASE_RPC_URL]);

    const staticNet = Network.from(chainId);

    if (urls.length === 1) {
        providerCache[chain] = new JsonRpcProvider(urls[0], staticNet, { staticNetwork: staticNet });
    } else {
        const fallbackConfigs = urls.map((url, index) => ({
            provider: new JsonRpcProvider(url, staticNet, { staticNetwork: staticNet }),
            priority: index + 1,
            weight: 1,
            stallTimeout: 1200
        }));
        providerCache[chain] = new FallbackProvider(fallbackConfigs, staticNet);
    }

    return providerCache[chain];
}
