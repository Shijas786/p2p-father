import { ethers, JsonRpcProvider, Network } from "ethers";
import { env } from "../config/env";

const BASE_RPCS = [
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    env.BASE_RPC_URL,
    "https://api.zan.top/base-mainnet",
    "https://1rpc.io/base"
].filter(Boolean);

const BSC_RPCS = [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
    env.BSC_RPC_URL,
    "https://1rpc.io/bnb"
].filter(Boolean);

const providerCache: Record<string, ethers.JsonRpcProvider> = {};

/**
 * Creates a low-latency JsonRpcProvider with staticNetwork enabled to eliminate
 * extra eth_chainId network roundtrips, avoiding quorum decode errors.
 */
export function getFastProvider(chain: 'base' | 'bsc' | string = 'base'): ethers.JsonRpcProvider {
    if (providerCache[chain]) {
        return providerCache[chain];
    }

    const chainId = chain === 'base' ? 8453 : (chain === 'bsc' ? 56 : 1);
    const primaryUrl = chain === 'base' ? BASE_RPCS[0] : (chain === 'bsc' ? BSC_RPCS[0] : env.BASE_RPC_URL);
    const staticNet = Network.from(chainId);

    providerCache[chain] = new JsonRpcProvider(primaryUrl, staticNet, { staticNetwork: staticNet });
    return providerCache[chain];
}
