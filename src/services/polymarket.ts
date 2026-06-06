import { Chain, ClobClient, OrderType, Side } from "@polymarket/clob-client-v2";
import { encodePacked, keccak256, createWalletClient, http } from "viem";
import https from "https";

// ==========================================
// ==========================================
// Direct IP Polymarket API Helper
// ==========================================
const POLYMARKET_IPS: Record<string, string> = {
    "data-api.polymarket.com": "104.18.34.205",
    "gamma-api.polymarket.com": "104.18.34.205",
    "clob.polymarket.com": "104.18.34.205",
};

async function polymarketGet(hostname: string, path: string, params?: any, extraOptions?: any) {
    const isConfig = params && (params.params || params.headers || params.timeout);
    const actualParams = isConfig ? params.params : params;
    const actualOptions = isConfig ? { ...params, ...extraOptions } : extraOptions;

    return axios.get(`https://${hostname}${path}`, {
        params: actualParams,
        timeout: actualOptions?.timeout || 8000,
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; P2PFather/1.0)",
            "Accept": "application/json",
            ...(actualOptions?.headers || {})
        },
        httpsAgent: customHttpsAgent,
        ...actualOptions
    });
}
// ==========================================
const dnsCache: Record<string, { ip: string; expires: number }> = {};

async function resolveWithDoH(hostname: string): Promise<string> {
    const res = await axios.get(`https://cloudflare-dns.com/dns-query`, {
        params: { name: hostname, type: "A" },
        headers: { Accept: "application/dns-json" },
        timeout: 3000,
    });

    const answers = res.data?.Answer ?? [];
    const aRecords = answers.filter((a: any) => a.type === 1);
    
    if (!aRecords.length) {
        // Try Google fallback
        const gRes = await axios.get(`https://dns.google/resolve`, {
            params: { name: hostname, type: "A" },
        });
        const gAnswers = gRes.data?.Answer ?? [];
        const gARecords = gAnswers.filter((a: any) => a.type === 1);
        if (!gARecords.length) throw new Error(`No A record for ${hostname}`);
        return gARecords[gARecords.length - 1].data;
    }

    return aRecords[aRecords.length - 1].data; // last A record
}

export const customHttpsAgent = new https.Agent({
    lookup: (hostname, _options, callback) => {
        import('dns').then(dns => {
            dns.lookup(hostname, _options, (err, address, family) => {
                if (!err && address) {
                    callback(null, address, family);
                } else if (hostname.includes('polymarket.com')) {
                    // System DNS failed (likely blocked by local ISP). Use hardcoded Cloudflare IP fallback.
                    const hardcodedIp = POLYMARKET_IPS[hostname] || POLYMARKET_IPS["data-api.polymarket.com"] || "104.18.34.205";
                    console.log(`[DNS] System DNS lookup failed for ${hostname}. Using hardcoded fallback IP: ${hardcodedIp}`);
                    callback(null, hardcodedIp, 4);
                } else {
                    callback(err, address || "", family || 4);
                }
            });
        }).catch(err => {
            callback(err, "", 4);
        });
    }
});
// ==========================================
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";
import { ethers } from "ethers";
import { wallet as walletService } from "./wallet";
import { env } from "../config/env";
import { db } from "../db/client";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

const clobCredsCache: Record<number, any> = {};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const marketCache: { [slug: string]: CacheEntry<ActiveMarketInfo> } = {};
const priceCache: { [tokenId: string]: CacheEntry<{ buyPrice: number; sellPrice: number }> } = {};
const positionsCache: { [proxyAddress: string]: CacheEntry<any[]> } = {};
const tradesCache: { [proxyAddress: string]: CacheEntry<any[]> } = {};
const PROXY_CACHE_TTL = 15 * 1000; // 15 seconds

export interface ActiveMarketInfo {
    conditionId: string;
    yesTokenId: string;
    noTokenId: string;
    question: string;
    slug: string;
    endsAt: string;
}

class PolymarketService {
    private hasCredentials = false;

    constructor() {
        this.hasCredentials = !!((env as any).POLYMARKET_PRIVATE_KEY && 
                                 (env as any).POLYMARKET_BUILDER_API_KEY && 
                                 (env as any).POLYMARKET_BUILDER_SECRET && 
                                 (env as any).POLYMARKET_BUILDER_PASSPHRASE);
    }

    private checkCredentials() {
        if (!this.hasCredentials) {
            throw new Error("Polymarket operations are disabled: Builder credentials are not configured.");
        }
    }

    /**
     * Get the user's pUSD balance in their Polymarket deposit wallet.
     * pUSD is Polymarket's native collateral token (launched April 2026, CLOB V2).
     * Contract: 0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB (Polygon)
     */
    async getPusdBalance(userWalletIndex: number): Promise<string> {
        try {
            const derived = walletService.deriveWallet(userWalletIndex);
            const { polymarketRelayerService } = await import("./relayer");
            const address = await polymarketRelayerService.resolveDepositWallet(userWalletIndex);
            // pUSD — Polymarket's native ERC-20 collateral (replaces USDC.e as of April 2026)
            const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

            const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");
            const contract = new ethers.Contract(pusdAddress, [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ], provider);

            const balance = await contract.balanceOf(address);
            const decimals = await contract.decimals();
            return ethers.formatUnits(balance, decimals);
        } catch (e: any) {
            console.warn("Failed to get Polymarket pUSD balance:", e.message);
            // Fallback for local/demo testing
            return "0.00";
        }
    }

    /**
     * Client for PLACING bets using Builder credentials but User signature
     */
    async getBuilderClobClient(userWalletIndex: number): Promise<ClobClient> {
        this.checkCredentials();
        // We bypass Builder API keys for individual user orders to avoid POLY_ADDRESS mismatch errors.
        // Instead, we always use the user's own L2 API key via getUserClobClient.
        const userClient = await this.getUserClobClient(userWalletIndex);
        if (!userClient) {
            throw new Error("Cannot place bet: User proxy not deployed. Please deposit USDC/pUSD first to initialize your Polymarket wallet.");
        }
        return userClient;
    }

    /**
     * Client for FETCHING trades using a generated Level 2 API key for the User's EOA
     * Returns null if the user has no proxy wallet deployed yet.
     */
    async getUserClobClient(userWalletIndex: number): Promise<ClobClient | null> {
        this.checkCredentials();
        const derived = walletService.deriveWallet(userWalletIndex);
        const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
        
        const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        const { polymarketRelayerService } = await import("./relayer");
        const depositWallet = await polymarketRelayerService.resolveDepositWallet(userWalletIndex);

        // Gasless Onboarding: Check if proxy is deployed. If not, automatically deploy it via Biconomy Relayer
        const code = await provider.getCode(depositWallet);
        if (code === "0x") {
            console.log(`[Polymarket] Proxy undeployed. Deploying natively via Relayer for user ${userWalletIndex}`);
            await polymarketRelayerService.deployDepositWallet(userWalletIndex);
            
            // Allow time for Polygon indexing before sending the next batch
            await new Promise(r => setTimeout(r, 2000));
        }

        const user = await db.getUserByWalletIndex(userWalletIndex);

        // Gasless Onboarding: Ensure CTF Exchange is approved to spend proxy's USDC
        if (!user?.polymarket_approved) {
            await polymarketRelayerService.approveExchange(userWalletIndex);
            if (user) {
                await db.updateUser(user.id, { polymarket_approved: true });
            }
        }

        const signer = createWalletClient({
            account,
            transport: http(rpcUrl),
        });

        let creds = clobCredsCache[userWalletIndex];
        if (!creds && user?.polymarket_api_key) {
            creds = {
                key: user.polymarket_api_key,
                secret: user.polymarket_secret,
                passphrase: user.polymarket_passphrase,
            };
            clobCredsCache[userWalletIndex] = creds;
        }

        if (creds) {
            return new ClobClient({
                host: CLOB_API,
                chain: Chain.POLYGON,
                signer,
                funderAddress: depositWallet,
                signatureType: 3, // POLY_1271
                creds,
            });
        }

        try {
            console.log(`[Polymarket] Deriving API credentials for user ${userWalletIndex} via standard SDK...`);
            const tempClient = new ClobClient({
                host: CLOB_API,
                chain: Chain.POLYGON,
                signer,
                signatureType: 3, // POLY_1271
                funderAddress: depositWallet,
            });

            let newCreds;
            try {
                console.log(`[Polymarket] Attempting to derive existing API key...`);
                newCreds = await tempClient.deriveApiKey();
            } catch (err: any) {
                console.log(`[Polymarket] deriveApiKey failed (status: ${err?.response?.status || err.message}). Attempting to create new API key...`);
                try {
                    newCreds = await tempClient.createApiKey();
                } catch (createErr: any) {
                    console.error(`[Polymarket] createApiKey also failed:`, createErr?.response?.data || createErr.message);
                    throw createErr;
                }
            }

            if (!newCreds?.secret) {
                throw new Error("CLOB credentials not initialized — API key creation failed");
            }

            clobCredsCache[userWalletIndex] = newCreds;
            
            if (user && newCreds.key) {
                await db.updateUser(user.id, {
                    polymarket_api_key: newCreds.key,
                    polymarket_secret: newCreds.secret,
                    polymarket_passphrase: newCreds.passphrase,
                    deposit_wallet_address: depositWallet,
                });
            }

            return new ClobClient({
                host: CLOB_API,
                chain: Chain.POLYGON,
                signer,
                funderAddress: depositWallet,
                signatureType: 3, // POLY_1271
                creds: newCreds,
            });
        } catch (err: any) {
            console.error("[Polymarket] Failed to derive API Key:", err.message);
            throw err;
        }
    }

    /**
     * Discover the currently active BTC 5-minute prediction market
     */
    async getActiveBtcMarket(): Promise<ActiveMarketInfo> {
        this.checkCredentials();
        // Compute exact mathematically correct slug for the current 5-minute window
        const now = Date.now();
        const windowStartSeconds = Math.floor(now / 300000) * 300;
        const slug = `btc-updown-5m-${windowStartSeconds}`;

        if (marketCache[slug] && now - marketCache[slug].timestamp < 5000) {
            try {
                await this.getOutcomePrice(marketCache[slug].data.yesTokenId);
                return marketCache[slug].data;
            } catch {
                // Cache is stale (illiquid token), bust it and refetch
                delete marketCache[slug];
                return await this.getActiveBtcMarket();
            }
        }

        try {

            // Fetch real active markets from Polymarket
            const res = await polymarketGet("gamma-api.polymarket.com", "/events", { slug }, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/"
                }
            });

            const events = res.data || [];
            if (events && events.length > 0) {
                const btcEvent = events[0];
                if (btcEvent.markets && btcEvent.markets.length > 0) {
                    const market = btcEvent.markets[0];
                    if (market.clobTokenIds) {
                        try {
                            const tokens = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : market.clobTokenIds;
                            if (Array.isArray(tokens) && tokens.length >= 2) {
                                const result = {
                                    conditionId: market.conditionId,
                                    yesTokenId: tokens[0], // YES (Up) outcome token ID
                                    noTokenId: tokens[1],  // NO (Down) outcome token ID
                                    question: market.question,
                                    slug: market.slug,
                                    endsAt: market.endDate || new Date(Date.now() + 86400000).toISOString(),
                                };
                                marketCache[slug] = { data: result, timestamp: now };
                                return result;
                            }
                        } catch (parseErr) {}
                    }
                }
            }
        } catch (err: any) {
            console.error("[Polymarket] Gamma active market fetch error:", err.message);
        }

        // Try CLOB API as a secondary fallback if Gamma is blocked by Cloudflare (or deprecated)
        try {
            console.log(`[Polymarket] Trying CLOB /markets endpoint for slug: ${slug}...`);
            const res = await polymarketGet("clob.polymarket.com", "/markets", {
                params: { market_slug: slug },
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/"
                },
                timeout: 5000,
            });
            const markets = res.data?.data || res.data || [];
            const targetMarket = markets.find((m: any) => m.market_slug === slug);
            
            if (targetMarket && targetMarket.tokens && targetMarket.tokens.length >= 2) {
                console.log("[Polymarket] Found active 5m BTC market via CLOB API!");
                const result = {
                    conditionId: targetMarket.condition_id,
                    yesTokenId: targetMarket.tokens[0].token_id,
                    noTokenId: targetMarket.tokens[1].token_id,
                    question: targetMarket.question,
                    slug: targetMarket.market_slug,
                    endsAt: targetMarket.end_date_iso || new Date(Date.now() + 86400000).toISOString(),
                };
                marketCache[slug] = { data: result, timestamp: Date.now() };
                return result;
            }
        } catch (err: any) {
            console.error("[Polymarket] CLOB markets fetch error:", err.message);
        }

        // Fallback: Try searching CLOB API by tag or series if slug format changed
        try {
            console.log(`[Polymarket] Fallback: Searching CLOB API for active BTC markets...`);
            const res = await polymarketGet("clob.polymarket.com", "/markets", {
                params: { active: true },
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                },
                timeout: 5000,
            });
            const markets = res.data?.data || res.data || [];
            const targetMarket = markets.find((m: any) => 
                m.active && 
                !m.closed && 
                m.tokens && 
                m.tokens.length >= 2 && 
                m.market_slug && m.market_slug.includes("btc-updown-5m")
            );

            if (targetMarket) {
                console.log("[Polymarket] Found active BTC market via fallback search!");
                const result = {
                    conditionId: targetMarket.condition_id,
                    yesTokenId: targetMarket.tokens[0].token_id,
                    noTokenId: targetMarket.tokens[1].token_id,
                    question: targetMarket.question,
                    slug: targetMarket.market_slug,
                    endsAt: targetMarket.end_date_iso || new Date(Date.now() + 86400000).toISOString(),
                };
                marketCache[slug] = { data: result, timestamp: Date.now() };
                return result;
            }
        } catch (err: any) {
            console.error("[Polymarket] Fallback search error:", err.message);
        }

        throw new Error("Polymarket active market lookup failed. Market APIs are currently unreachable.");
    }

    /**
     * Get the current price / best order book bids and asks for a token outcome
     */
    async getOutcomePrice(tokenId: string, isNo: boolean = false): Promise<{ buyPrice: number; sellPrice: number }> {
        const now = Date.now();
        if (priceCache[tokenId] && now - priceCache[tokenId].timestamp < 1500) {
            return priceCache[tokenId].data;
        }

        if ((this as any).deadMarkets?.has(tokenId)) {
            throw new Error("This market is closed or dead. Try a different market.");
        }

        try {
            const res = await polymarketGet("clob.polymarket.com", "/book", {
                params: { token_id: tokenId },
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/"
                },
                timeout: 5000,
            });

            const book = res.data;
            
            if (!book?.bids?.length && !book?.asks?.length) {
                throw new Error("This market has no liquidity. Try a different market.");
            }

            const bestBid = book?.bids?.[0]?.price ? parseFloat(book.bids[0].price) : null;
            const bestAsk = book?.asks?.[0]?.price ? parseFloat(book.asks[0].price) : null;

            if (bestBid === null || bestAsk === null) {
                throw new Error("This market has no liquidity on one or more sides. Try a different market.");
            }

            const result = {
                buyPrice: bestAsk,
                sellPrice: bestBid,
            };

            priceCache[tokenId] = { data: result, timestamp: now };
            return result;
        } catch (err: any) {
            if (err.response?.status === 400 || err.message?.includes('status code 400')) {
                if (!(this as any).deadMarkets) (this as any).deadMarkets = new Set();
                (this as any).deadMarkets.add(tokenId);
            }
            
            if (err.message?.includes('no liquidity')) {
                console.log(`[SYNC] Skipping illiquid market ${tokenId}`);
            } else {
                console.error(`[Polymarket] CLOB book fetch error for ${tokenId}:`, err.message);
            }
            
            throw new Error(`Failed to fetch price: ${err.message}`);
        }
    }

    /**
     * Place a prediction bet on YES (Up) or NO (Down)
     * @param userWalletIndex The user's derived wallet index
     * @param tokenId The outcome token ID (YES or NO)
     * @param amountUsdc Amount of USDC.e to invest (e.g. 10.0)
     * @param limitPrice Target price per share (e.g. 0.55)
     */
    async placeBet(
        userWalletIndex: number,
        tokenId: string,
        amountUsdc: number,
        limitPrice: number,
        side: "BUY" | "SELL" = "BUY",
        orderType: "MARKET" | "LIMIT" = "MARKET"
    ): Promise<any> {
        this.checkCredentials();

        try {
            const client = await this.getBuilderClobClient(userWalletIndex);

            if (side === "SELL") {
                const { polymarketRelayerService } = await import("./relayer");
                await polymarketRelayerService.approveConditionalTokens(userWalletIndex);
            }

            if (orderType === "MARKET") {
                if (amountUsdc < 1) {
                    throw new Error("Polymarket requires a minimum of $1 for market orders.");
                }

                const orderArgs = {
                    tokenID: tokenId,
                    amount: amountUsdc,
                    side: side === "SELL" ? Side.SELL : Side.BUY,
                };

                console.log(`[Polymarket] Submitting FOK MARKET ${side} order to CLOB. Amount: ${amountUsdc}`);
                const marketInfo = await client.getMarket(tokenId);
                const negRisk = marketInfo?.neg_risk || false;
                
                const response = await client.createAndPostMarketOrder(
                    orderArgs,
                    { tickSize: "0.01", negRisk },
                    OrderType.FOK
                );
                return response;
            } else {
                // LIMIT order
                let size = amountUsdc / limitPrice;
                
                // Polymarket minimum order constraints for LIMIT orders
                const MIN_SHARES = 5;
                if (size < MIN_SHARES) {
                    console.log(`[Polymarket] Auto-bumping limit order size from ${size} to ${MIN_SHARES} shares to meet CLOB minimums.`);
                    size = MIN_SHARES;
                }

                const orderArgs = {
                    tokenID: tokenId,
                    price: limitPrice,
                    side: side === "SELL" ? Side.SELL : Side.BUY,
                    size,
                    builderCode: "P2P_KERALA"
                };

                console.log(`[Polymarket] Submitting GTC LIMIT ${side} order to CLOB. Size: ${size} shares at $${limitPrice}`);
                const response = await client.createAndPostOrder(
                    orderArgs,
                    { tickSize: "0.01" },
                    OrderType.GTC
                );
                return response;
            }
        } catch (err: any) {
            console.error("[Polymarket] Order execution failed:", err.message);
            throw err;
        }
    }

    async getTradesForProxy(proxyAddress: string): Promise<any[]> {
        const cacheKey = proxyAddress.toLowerCase();
        const now = Date.now();
        if (tradesCache[cacheKey] && (now - tradesCache[cacheKey].timestamp < PROXY_CACHE_TTL)) {
            return tradesCache[cacheKey].data;
        }

        try {
            const res = await polymarketGet("data-api.polymarket.com", "/trades", { user: proxyAddress.toLowerCase(), limit: "500" });
            const trades = Array.isArray(res.data) ? res.data : [];
            const mapped = trades.map(t => ({ 
                ...t, 
                asset_id: t.asset_id || t.asset,
                market: t.conditionId 
            }));
            tradesCache[cacheKey] = { data: mapped, timestamp: now };
            console.log(`[Trades] Fetched ${mapped.length} trades from Data API for wallet ${proxyAddress}`);
            return mapped;
        } catch (e: any) {
            try {
                const res = await polymarketGet("gamma-api.polymarket.com", "/trades", { user: proxyAddress, limit: "500" });
                const trades = Array.isArray(res.data) ? res.data : [];
                const mapped = trades.map(t => ({ 
                    ...t, 
                    asset_id: t.asset_id || t.asset,
                    market: t.conditionId 
                }));
                tradesCache[cacheKey] = { data: mapped, timestamp: now };
                console.log(`[Trades] Fetched ${mapped.length} trades from Gamma API fallback for wallet ${proxyAddress}`);
                return mapped;
            } catch (e2: any) {
                console.log(`[Trades] Failed to fetch trades for ${proxyAddress}. Data API: ${e.message} | Gamma API: ${e2.message}`);
                return [];
            }
        }
    }

    async getPositionsForProxy(proxyAddress: string): Promise<any[]> {
        const cacheKey = proxyAddress.toLowerCase();
        const now = Date.now();
        if (positionsCache[cacheKey] && (now - positionsCache[cacheKey].timestamp < PROXY_CACHE_TTL)) {
            return positionsCache[cacheKey].data;
        }

        try {
            const res = await polymarketGet("data-api.polymarket.com", "/positions", { user: proxyAddress.toLowerCase(), sizeThreshold: "0.01" });
            const data = Array.isArray(res.data) ? res.data : [];
            positionsCache[cacheKey] = { data, timestamp: now };
            console.log(`[Positions] Fetched ${data.length} positions from Data API for wallet ${proxyAddress}`);
            return data;
        } catch (e: any) {
            try {
                const res = await polymarketGet("gamma-api.polymarket.com", "/positions", { user: proxyAddress });
                const data = Array.isArray(res.data) ? res.data : [];
                positionsCache[cacheKey] = { data, timestamp: now };
                console.log(`[Positions] Fetched ${data.length} positions from Gamma API fallback for wallet ${proxyAddress}`);
                return data;
            } catch (e2: any) {
                console.log(`[Positions] Failed to fetch positions for ${proxyAddress}. Data API: ${e.message} | Gamma API: ${e2.message}`);
                return [];
            }
        }
    }

    clearPositionsCache(proxyAddress: string) {
        const cacheKey = proxyAddress.toLowerCase();
        delete positionsCache[cacheKey];
        console.log(`[Cache] Cleared positions cache for ${cacheKey}`);
    }
}

export const polymarketService = new PolymarketService();

