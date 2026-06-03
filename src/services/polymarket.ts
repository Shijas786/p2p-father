import { Chain, ClobClient, OrderType, Side } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";
import { ethers } from "ethers";
import { wallet as walletService } from "./wallet";
import { env } from "../config/env";

const GAMMA_API = "https://gamma-api.polymarket.com";
const CLOB_API = "https://clob.polymarket.com";

const clobCredsCache: Record<number, any> = {};

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}
const marketCache: { [slug: string]: CacheEntry<ActiveMarketInfo> } = {};
const priceCache: { [tokenId: string]: CacheEntry<{ buyPrice: number; sellPrice: number }> } = {};

export interface ActiveMarketInfo {
    conditionId: string;
    yesTokenId: string;
    noTokenId: string;
    question: string;
    slug: string;
    endsAt: string;
}

class PolymarketService {
    private isDemoMode = false;

    constructor() {
        const hasCredentials = (env as any).POLYMARKET_PRIVATE_KEY && 
                               (env as any).POLYMARKET_BUILDER_API_KEY && 
                               (env as any).POLYMARKET_BUILDER_SECRET && 
                               (env as any).POLYMARKET_BUILDER_PASSPHRASE;

        if (!hasCredentials) {
            this.isDemoMode = true;
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
            const address = derived.address;
            // pUSD — Polymarket's native ERC-20 collateral (replaces USDC.e as of April 2026)
            const pusdAddress = "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB";

            const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com");
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
        const derived = walletService.deriveWallet(userWalletIndex);
        const account = privateKeyToAccount(derived.privateKey as `0x${string}`);
        
        const rpcUrl = process.env.POLYGON_RPC_URL || "https://polygon.llamarpc.com";
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        const { polymarketRelayerService } = await import("./relayer");
        const depositWallet = await polymarketRelayerService.resolveDepositWallet(userWalletIndex);

        // Gasless Onboarding: Check if proxy is deployed. If not, automatically deploy it via Biconomy Relayer
        const code = await provider.getCode(depositWallet);
        if (code === "0x") {
            console.log(`[Polymarket] Proxy undeployed. Deploying natively via Relayer for user ${userWalletIndex}`);
            await polymarketRelayerService.deployDepositWallet(userWalletIndex);
        }

        const signer = createWalletClient({
            account,
            transport: http(rpcUrl),
        });

        if (clobCredsCache[userWalletIndex]) {
            return new ClobClient({
                host: CLOB_API,
                chain: Chain.POLYGON,
                signer,
                funderAddress: depositWallet,
                signatureType: 3, // POLY_1271
                creds: clobCredsCache[userWalletIndex],
            });
        }

        const tempClient = new ClobClient({
            host: CLOB_API,
            chain: Chain.POLYGON,
            signer,
            funderAddress: depositWallet,
            signatureType: 3, // POLY_1271
        });

        try {
            const creds = await tempClient.createOrDeriveApiKey();
            clobCredsCache[userWalletIndex] = creds;

            return new ClobClient({
                host: CLOB_API,
                chain: Chain.POLYGON,
                signer,
                funderAddress: depositWallet,
                signatureType: 3, // POLY_1271
                creds,
            });
        } catch (e: any) {
            console.warn("[Polymarket] Failed to derive API Key:", e.message);
            return null;
        }
    }

    /**
     * Discover the currently active BTC 5-minute prediction market
     */
    async getActiveBtcMarket(): Promise<ActiveMarketInfo> {
        // Compute exact mathematically correct slug for the current 5-minute window
        const now = Date.now();
        const windowStartSeconds = Math.floor(now / 300000) * 300;
        const slug = `btc-updown-5m-${windowStartSeconds}`;

        if (marketCache[slug] && now - marketCache[slug].timestamp < 15000) {
            return marketCache[slug].data;
        }

        try {

            // Fetch real active markets from Polymarket
            const res = await axios.get(`${GAMMA_API}/events`, {
                params: { slug },
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                    "Accept": "application/json",
                    "Origin": "https://polymarket.com",
                    "Referer": "https://polymarket.com/"
                },
                timeout: 5000,
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
            const res = await axios.get(`${CLOB_API}/markets`, {
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

        if (this.isDemoMode) {
            console.log("[Polymarket] Demo mode: Falling back to known static BTC token IDs");
            return {
                conditionId: "0x_demo_condition_id",
                yesTokenId: "40286392070894520973685412975931221774338575086053303358043681403206338547209", // Example active token
                noTokenId: "77761009149959600109918073539828815183350293041935835923910609533355590928220",  // Example active token
                question: "Will Bitcoin close higher today?",
                slug: `btc-daily-fallback`,
                endsAt: new Date(Date.now() + 86400000).toISOString(),
            };
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

        try {
            const res = await axios.get(`${CLOB_API}/book`, {
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
            const bestBid = book?.bids?.[0]?.price ? parseFloat(book.bids[0].price) : null;
            const bestAsk = book?.asks?.[0]?.price ? parseFloat(book.asks[0].price) : null;

            if (bestBid === null || bestAsk === null) {
                throw new Error("Empty order book");
            }

            const result = {
                buyPrice: bestAsk,
                sellPrice: bestBid,
            };

            priceCache[tokenId] = { data: result, timestamp: now };
            return result;
        } catch (err: any) {
            console.error(`[Polymarket] CLOB book fetch error for ${tokenId}:`, err.message);
            // Instead of returning 0.50, return a more obvious fallback or throw
            // Since UI depends on it, returning a price that is 1 - other price might be better, 
            // but we don't have the other price here. Let's just return a placeholder that makes it obvious it failed.
            // Wait, if it's the YES token that failed, returning 0.5 is what caused the bug.
            // Let's throw the error so the API returns 500 and the frontend retries.
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
        side: "BUY" | "SELL" = "BUY"
    ): Promise<any> {
        if (this.isDemoMode || tokenId.startsWith("0x_demo_")) {
            console.log(`[Polymarket] [Demo Mode] Placed ${side} order of ${amountUsdc} USDC on token ${tokenId} at limit price ${limitPrice}`);
            return {
                orderId: `sim_${Math.random().toString(36).substring(2, 11)}`,
                success: true
            };
        }

        try {
            const client = await this.getBuilderClobClient(userWalletIndex);

            // Size = Total spend / Limit price
            const size = amountUsdc / limitPrice;
            if (size <= 0) {
                throw new Error("Invalid order size. Increase amount or choose a better price.");
            }

            const orderArgs = {
                tokenID: tokenId,
                price: limitPrice,
                side: side === "SELL" ? Side.SELL : Side.BUY,
                size,
            };

            console.log(`[Polymarket] Submitting GTC ${side} order to CLOB. Size: ${size} shares at $${limitPrice}`);
            const response = await client.createAndPostOrder(
                orderArgs,
                { tickSize: "0.01" },
                OrderType.GTC
            );
            return response;
        } catch (err: any) {
            console.error("[Polymarket] Order execution failed:", err.message);
            throw err;
        }
    }
}

export const polymarketService = new PolymarketService();
