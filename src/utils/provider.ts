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

const providerCache: Record<string, ethers.JsonRpcProvider> = {};

/**
 * Creates a low-latency JsonRpcProvider with staticNetwork: true enabled.
 * Static network mode eliminates startup 'failed to detect network' errors completely.
 */
export function getFastProvider(chain: 'base' | 'bsc' | string = 'base'): ethers.JsonRpcProvider {
    if (providerCache[chain]) {
        return providerCache[chain];
    }

    const chainId = chain === 'base' ? 8453 : (chain === 'bsc' ? 56 : 1);
    const rpcList = chain === 'base' ? BASE_RPCS : (chain === 'bsc' ? BSC_RPCS : BASE_RPCS);
    const primaryUrl = rpcList[0] || (chain === 'base' ? env.BASE_RPC_URL : env.BSC_RPC_URL);
    const staticNet = Network.from(chainId);

    const provider = new JsonRpcProvider(primaryUrl, staticNet, { staticNetwork: true });
    providerCache[chain] = provider;
    return provider;
}
