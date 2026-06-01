
        // Step 2: Obtain Level 2 API credentials via EIP-712 wallet signature
        const creds = await tempClient.createOrDeriveApiKey();

        // Step 3: Return authenticated client configured for trading
        return new ClobClient({
            host: CLOB_API,
            chain: Chain.POLYGON,
            signer,
            creds,
        });
    }

    /**
     * Discover the currently active BTC 5-minute prediction market
     */
    async getActiveBtcMarket(): Promise<ActiveMarketInfo> {
        try {
            const now = Math.floor(Date.now() / 1000);
            const activeEpoch = now - (now % 300);
            const slug = `btc-updown-5m-${activeEpoch}`;

            const res = await polyAxios.get(`${GAMMA_API}/events`, {
                params: { slug },
                timeout: 8000,
            });

            const event = res.data?.[0];
            if (!event || !event.markets || event.markets.length === 0) {
                throw new Error(`Market not active or indexed for slug: ${slug}`);
            }

            const market = event.markets[0];
            
            // Gamma API sometimes returns clobTokenIds as a stringified JSON array
            let parsedTokenIds = market.clobTokenIds;
            if (typeof parsedTokenIds === 'string') {
                try {
                    parsedTokenIds = JSON.parse(parsedTokenIds);
                } catch (e) {
                    console.error("Failed to parse clobTokenIds:", parsedTokenIds);
                    parsedTokenIds = [];
                }
            }

            console.log(`[Polymarket] Fetched market for slug ${slug}: ${market.question}`);

            return {
                conditionId: market.conditionId,
                yesTokenId: parsedTokenIds[0] || "", // YES (Up) outcome token ID
                noTokenId: parsedTokenIds[1] || "",  // NO (Down) outcome token ID
                question: market.question,
                slug: market.slug,
                endsAt: market.endsAt,
            };
        } catch (err: any) {
            console.error("[Polymarket] Gamma active market fetch error:", err.message);
            // Fallback to Demo Simulation Mode for local/dev testing
            const now = Math.floor(Date.now() / 1000);
            const activeEpoch = now - (now % 300);
            const endsAt = new Date((activeEpoch + 300) * 1000).toISOString();
            console.log("[Polymarket] Falling back to Demo BTC 5-minute prediction market info");
            return {
                conditionId: "0x_demo_condition_id",
                yesTokenId: "0x_demo_yes_token_id",
                noTokenId: "0x_demo_no_token_id",
                question: "Will BTC-USD price be higher at the end of this 5-minute epoch?",
                slug: `btc-updown-5m-${activeEpoch + 300}`,
                endsAt,
            };
        }
    }

    /**
     * Get the current price / best order book bids and asks for a token outcome
     */
    async getOutcomePrice(tokenId: string, isNo: boolean = false): Promise<{ buyPrice: number; sellPrice: number }> {
        const getDynamicFallback = async () => {
            try {
                const res = await polyAxios.get("https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300&limit=1", {
                    headers: { "User-Agent": "Mozilla/5.0" },
                    timeout: 3000
                });
                const tickerRes = await polyAxios.get("https://api.exchange.coinbase.com/products/BTC-USD/ticker", {
                    headers: { "User-Agent": "Mozilla/5.0" },
                    timeout: 3000
                });
                const d = res.data?.[0];
                if (d && tickerRes.data?.price) {
                    const open = parseFloat(d[3]);
                    const close = parseFloat(tickerRes.data.price);
                        
                        const volatility = Math.max(2.0, 100.0 * Math.sqrt(remainingSecs / 300));
                        const z = diff / volatility;
                        
                        const cdf = (val: number) => 1 / (1 + Math.exp(-1.702 * val));
                        const prob = cdf(z);
                        
                        let buyPrice = Math.max(0.05, Math.min(0.95, prob));
                        if (isNo) {
                            buyPrice = 1.0 - buyPrice;
                        }
                        
                        buyPrice = parseFloat(buyPrice.toFixed(2));
                        const sellPrice = parseFloat(Math.max(0.01, buyPrice - 0.02).toFixed(2));
                        return { buyPrice, sellPrice };
                    }
                } catch (binErr: any) {
                    console.warn("[Polymarket-Service] Binance dynamic fallback failed:", binErr.message);
                }
            }
            
            // final fallback: fluctuate around 0.50
            const randomOffset = (Math.sin(Date.now() / 10000) * 0.15);
            const mid = 0.50 + randomOffset;
            const buyPrice = Math.max(0.05, Math.min(0.95, isNo ? 1.0 - mid : mid));
            const mid = 0.50 + randomOffset;
            const buyPrice = Math.max(0.05, Math.min(0.95, isNo ? 1.0 - mid : mid));
            return {
                buyPrice: parseFloat(buyPrice.toFixed(2)),
                sellPrice: parseFloat(Math.max(0.01, buyPrice - 0.02).toFixed(2)),
            };
        };

        if (tokenId.startsWith("0x_demo_")) {
            return getDynamicFallback();
        }
        try {
            const res = await polyAxios.get(`${CLOB_API}/book`, {
                params: { token_id: tokenId },
                timeout: 5000,
            });

            const book = res.data;
            const bestBid = book?.bids?.[0]?.price ? parseFloat(book.bids[0].price) : null;
            const bestAsk = book?.asks?.[0]?.price ? parseFloat(book.asks[0].price) : null;

            if (bestBid === null || bestAsk === null) {
                throw new Error("Empty order book");
            }

            return {
                buyPrice: bestAsk,
                sellPrice: bestBid,
            };
        } catch (err: any) {
            console.error(`[Polymarket] CLOB book fetch error for ${tokenId}, using dynamic fallback:`, err.message);
            return getDynamicFallback();
        }
    }

    /**