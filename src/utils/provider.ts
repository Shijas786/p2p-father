import { ethers, JsonRpcProvider, FallbackProvider, Network } from "ethers";
import { env } from "../config/env";

const ALCHEMY_KEY_1 = "ALCHEMY_API_KEY_PLACEHOLDER";
const ALCHEMY_KEY_2 = "alch_REDACTED";

const BASE_RPCS = [
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://api.zan.top/base-mainnet",
    "https://1rpc.io/base",
].filter(Boolean);

const BSC_RPCS = [
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_2}`,
    `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY_1}`,
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    "https://1rpc.io/bnb",
].filter(Boolean);

const providerCache: Record<string, ethers.FallbackProvider | ethers.JsonRpcProvider> = {};

/**
 * Creates a low-latency FallbackProvider with multiple RPC endpoints & API key failover.
 * If any primary RPC hits rate limits (429) or stalls (>2s), it instantly shifts to the next key/node.
 */
export function getFastProvider(chain: 'base' | 'bsc' | string = 'base'): ethers.FallbackProvider | ethers.JsonRpcProvider {
    if (providerCache[chain]) {
        return providerCache[chain];
    }

    const chainId = chain === 'base' ? 8453 : (chain === 'bsc' ? 56 : 1);
    const rpcList = chain === 'base' ? BASE_RPCS : (chain === 'bsc' ? BSC_RPCS : BASE_RPCS);
    const staticNet = Network.from(chainId);

    try {
        const configs = rpcList.map((url, i) => ({
            provider: new JsonRpcProvider(url, staticNet, { staticNetwork: staticNet }),
            priority: i + 1,
            stallTimeout: 2000,
            weight: 1,
        }));

        const fallback = new FallbackProvider(configs, chainId, { quorum: 1 });
        providerCache[chain] = fallback;
        return fallback;
    } catch (_) {
        // Fallback to single primary provider if FallbackProvider setup fails
        const primaryUrl = rpcList[0];
        const single = new JsonRpcProvider(primaryUrl, staticNet, { staticNetwork: staticNet });
        providerCache[chain] = single;
        return single;
    }
}
