// Force hot reload
import { bot } from "./bot";
import { env } from "./config/env";
import { db } from "./db/client"; // Import DB for stats
import express from "express";
import path from "path";
import axios from "axios";

import { miniappRouter } from "./api/miniapp";
import { customHttpsAgent } from "./services/polymarket";

async function main() {
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  🤖 P2PFather Bot Starting...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("");
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`  Network:     ${env.DEFAULT_CHAIN}`);
    console.log(`  Token:       ${env.DEFAULT_TOKEN}`);
    console.log(`  Fee:         ${env.FEE_BPS} bps (${env.FEE_PERCENTAGE * 100}%)`);
    console.log(`  Testnet:     ${env.IS_TESTNET}`);
    console.log(`  Admin IDs:   ${env.ADMIN_IDS.length > 0 ? env.ADMIN_IDS.join(", ") : "None set"}`);
    console.log(`  OpenAI:      ${env.OPENAI_API_KEY ? "✅ Configured" : "❌ Not set (using fallback)"}`);
    console.log(`  Supabase:    ${env.SUPABASE_URL ? "✅ Configured" : "❌ Not set"}`);
    console.log(`  Escrow:      ${env.ESCROW_CONTRACT_ADDRESS ? "✅ " + env.ESCROW_CONTRACT_ADDRESS : "❌ Not deployed"}`);
    console.log("");

    console.log("=== POLYMARKET RELAYER NETWORK TEST ===");
    try {
        const baseUrl = process.env.RELAYER_URL || "https://relayer-v2.polymarket.com";
        console.log(`Target URL: ${baseUrl}`);
        // Just do a simple GET request to check network reachability instead of an unauthenticated POST to /submit
        const res = await axios.get(baseUrl, { timeout: 10000 });
        console.log("✅ Polymarket Relayer Connection SUCCESS!");
    } catch (e: any) {
        // We only care if it's a hard network error (DNS/Timeout). 
        // 404 or 401 from the root path still means we can reach the server.
        if (e.response && (e.response.status === 404 || e.response.status === 401 || e.response.status === 403)) {
            console.log("✅ Polymarket Relayer Connection SUCCESS! (Reached Server)");
        } else {
            console.error("❌ Polymarket Relayer Connection FAILED!");
            if (e.response) {
                console.error("Status:", e.response.status);
                console.error("Data:", JSON.stringify(e.response.data));
            } else {
                console.error("Network Error (Timeout, DNS, or IP Blocked):", e.message);
            }
        }
    }
    console.log("=======================================");


    // Start the bot
    console.log("  Starting Telegram bot (long polling)...");

    // Background Jobs
    if (env.NODE_ENV !== 'test') {
        const { startExpiryJob, startLiquiditySyncJob, startAutoClaimJob } = await import("./services/jobs");
        const { escrow } = await import("./services/escrow");
        const { bridgeMonitor } = await import("./services/bridge-monitor");
        // 🚀 Deposit Monitor disabled globally - now runs on-demand via API
        
        // 🚀 Start background services
        startExpiryJob();
        startLiquiditySyncJob(escrow);
        // startAutoClaimJob(); // Disabled background auto-claim service, using manual claim button instead
        bridgeMonitor.start(); // 🌉 Track pending cross-chain bridge deposits
    }


    console.log("");

    // Start Express Server (Website + Health Check)
    const app = express();
    const port = process.env.PORT || 8000;

    // CORS for Mini App
    app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data");
        if (req.method === "OPTIONS") return res.sendStatus(204);
        next();
    });

    // JSON body parser
    app.use(express.json());

    // Serve static files from public folder
    // Uses process.cwd() to be safe across dev/prod (Docker)
    app.use(express.static(path.join(process.cwd(), "public")));

    // Serve Mini App frontend — NUCLEAR NO CACHING
    const miniAppDist = path.join(process.cwd(), "miniapp", "dist");
    const noCacheHeaders = (res: any) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
    };
    const staticOpts = { setHeaders: noCacheHeaders, etag: false, lastModified: false };
    app.use("/app", express.static(miniAppDist, staticOpts));

    // NEW PATH — bypasses CDN cache entirely (fresh URL = no cached version)
    app.use("/miniapp", express.static(miniAppDist, staticOpts));

    // Mount Mini App API
    app.use("/api/miniapp", miniappRouter);

    // API Stats Endpoint (Consumed by the frontend)
    app.get("/api/stats", async (req, res) => {
        try {
            const stats = await db.getStats();

            // Bags.fm Stats
            const { bags } = await import("./services/bags");
            const bagsStats = await bags.getConsolidatedStats(env.BAGS_TOKEN_MINT);

            res.json({
                total_users: stats.total_users,
                total_trades: stats.completed_trades,
                total_volume_usdc: stats.total_volume_generic || 0,
                total_fees_amount: stats.total_fees_amount || 0,
                active_orders: stats.active_orders,
                fee_percentage: env.FEE_PERCENTAGE,
                fee_bps: parseInt(env.FEE_BPS),
                bags: bagsStats
                    ? {
                        price: bagsStats.price,
                        mcap: bagsStats.mcap,
                        liquidity: (bagsStats as any).liquidity || 0
                    }
                    : null
            });
        } catch (e) {
            console.error("API Error:", e);
            res.status(500).json({ error: "Failed to fetch stats" });
        }
    });

    app.get("/api/leaderboard", async (req, res) => {
        try {
            const timeframe = (req.query.timeframe as string) || "all";
            let days = 0;
            if (timeframe === "7d") days = 7;
            else if (timeframe === "30d") days = 30;

            const dbInstance = (db as any).getClient();
            const { data: users, error } = await dbInstance.rpc("get_timeframe_leaderboard", {
                p_days: days,
                p_limit: 100,
                p_offset: 0
            });
            if (error) throw error;
            res.json({ leaderboard: users || [] });
        } catch (e: any) {
            console.error("Leaderboard API Error:", e);
            res.status(500).json({ error: "Failed to fetch leaderboard" });
        }
    });

    app.get("/api/referral-leaderboard", async (req, res) => {
        try {
            const dbInstance = (db as any).getClient();
            const { data: referrals, error } = await dbInstance
                .from("referrals")
                .select("referrer_telegram_id, status")
                .eq("status", "completed");

            if (error) throw error;

            const counts: Record<number, number> = {};
            for (const ref of referrals || []) {
                const id = ref.referrer_telegram_id;
                counts[id] = (counts[id] || 0) + 1;
            }

            const referrerIds = Object.keys(counts).map(Number);
            if (referrerIds.length === 0) {
                return res.json({ leaderboard: [] });
            }

            const { data: users, error: userError } = await dbInstance
                .from("users")
                .select("telegram_id, username, first_name, photo_url")
                .in("telegram_id", referrerIds);

            if (userError) throw userError;

            const leaderboard = users.map((u: any) => ({
                id: String(u.telegram_id),
                name: u.username ? `@${u.username}` : (u.first_name || "Anonymous"),
                photo_url: u.photo_url,
                count: counts[u.telegram_id] || 0
            })).sort((a: any, b: any) => b.count - a.count);

            res.json({ leaderboard });
        } catch (e: any) {
            console.error("Referral Leaderboard API Error:", e);
            res.status(500).json({ error: "Failed to fetch referral leaderboard" });
        }
    });

    app.get("/api/live-pulse", async (req, res) => {
        try {
            const dbInstance = (db as any).getClient();

            // Fetch recent completed trades for earners
            const { data: recentTrades } = await dbInstance
                .from("trades")
                .select("*, seller:users!trades_seller_id_fkey(username, first_name, photo_url, receive_address), buyer:users!trades_buyer_id_fkey(username, first_name, photo_url, receive_address), release_tx_hash, escrow_tx_hash")
                .eq("status", "completed")
                .order("updated_at", { ascending: false })
                .limit(10);

            // Fetch recent active orders for recent activity
            const { data: recentOrders } = await dbInstance
                .from("orders")
                .select("*, users!inner(username, first_name, photo_url)")
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(10);

            let earners = (recentTrades || []).map((t: any) => ({
                seller_name: t.seller?.username || t.seller?.first_name || t.seller_username || "Seller",
                buyer_name: t.buyer?.username || t.buyer?.first_name || "Buyer",
                amount: t.amount || 200,
                token: t.token || "USDT",
                chain: t.chain || "bsc",
                avatar: t.seller?.photo_url || t.buyer?.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${t.seller?.username || t.buyer?.username || 'Felix'}`,
                tx_hash: t.release_tx_hash || t.escrow_tx_hash || "0xab42617f10b5c10b"
            }));

            if (earners.length === 0) {
                earners = [
                    { seller_name: "ArtemEnko", buyer_name: "YuriiL", amount: 200, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Artem", tx_hash: "0xab42617f10b5c10b" },
                    { seller_name: "AlexKumar", buyer_name: "PavloD", amount: 500, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Yurii", tx_hash: "0x12dc55a73e3b8a3d" },
                    { seller_name: "SvitlanaM", buyer_name: "BIBI", amount: 200, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Pavlo", tx_hash: "0x89fd5a2c4e1b7c3d" },
                    { seller_name: "AminuA", buyer_name: "VictorI", amount: 300, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Svitlana", tx_hash: "0x78cf5a1a1b3c9d2b" },
                    { seller_name: "Shijas", buyer_name: "AlexK", amount: 500, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=BIBI", tx_hash: "0x34ba12cb02aa11cd" },
                ];
            }

            let activities = (recentOrders || []).map((o: any) => ({
                name: o.users?.username || o.users?.first_name || "Trader",
                action: `just posted a ${o.type} order`,
                amount: o.amount,
                token: o.token,
                time: "1m",
                avatar: o.users?.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${o.id || 'Order'}`
            }));

            if (activities.length === 0) {
                activities = [
                    { name: "Aminu Adeshola", action: "just submitted a trade order", time: "1m", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aminu" },
                    { name: "Victor Ilori", action: "just matched a buy order", time: "4m", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Victor" },
                    { name: "Alex Kumar", action: "just released crypto", time: "11m", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex" },
                ];
            }

            res.json({ earners, activities });
        } catch (e) {
            console.error("API Error in /api/live-pulse:", e);
            res.status(500).json({ error: "Failed to fetch live pulse data" });
        }
    });


    // Health Check (Koyeb needs a 200 OK)
    app.get("/health", (req, res) => res.send("OK"));

    // Check server public IP
    app.get('/ip', async (req, res) => {
        try {
            const r = await fetch('https://api.ipify.org?format=json');
            res.json(await r.json());
        } catch (e) {
            res.status(500).json({ error: "Failed to fetch IP" });
        }
    });

    // Mini App SPA fallback — also set no-cache headers
    app.get(/^\/app(?:\/.*)?$/, (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });
    app.get(/^\/miniapp(?:\/.*)?$/, (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });

    // Guide page
    app.get("/guide", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "guide.html"));
    });

    // Father's Hub (Web3 dApp Page)
    app.get("/hub", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "hub.html"));
    });

    // Fallback file serving
    app.get(/^.*$/, (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "index.html"));
    });

    const http = await import("http");
    const { WebSocketServer } = await import("ws");
    const WebSocket = (await import("ws")).default;

    const server = http.createServer(app);

    // ── BTC Price WebSocket Proxy ───────────────────────────────────
    // Mobile carriers (Jio/Airtel) block direct connections to Binance.
    // We proxy through Railway so the miniapp always gets live price.
    const wss = new WebSocketServer({ server, path: "/ws/btcprice" });

    let binanceWs: any = null;
    let lastPrice: string | null = null;
    const clients = new Set<any>();

    const connectBinance = () => {
        binanceWs = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
        binanceWs.on("message", (data: any) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (parsed.p) {
                    lastPrice = parsed.p;
                    const msg = JSON.stringify({ p: parsed.p, t: parsed.T });
                    for (const client of clients) {
                        if (client.readyState === 1) client.send(msg);
                    }
                }
            } catch {}
        });
        binanceWs.on("close", () => setTimeout(connectBinance, 3000));
        binanceWs.on("error", () => binanceWs?.terminate());
    };
    connectBinance();

    wss.on("connection", (client) => {
        clients.add(client);
        // Send last known price immediately so UI isn't blank
        if (lastPrice) client.send(JSON.stringify({ p: lastPrice }));
        client.on("close", () => clients.delete(client));
        client.on("error", () => clients.delete(client));
    });

    // ── Polymarket User WebSocket Proxy ─────────────────────────────
    // Indian ISPs block ws-subscriptions-clob.polymarket.com.
    // We proxy/tunnel user WebSocket subscriptions through our Railway server.
    const userWss = new WebSocketServer({ server, path: "/ws/polymarket-user" });

    userWss.on("connection", (clientWs) => {
        console.log("[User WS Proxy] Client connected");

        let polyWs: any = null;
        let isClosed = false;

        const closeConnections = () => {
            if (isClosed) return;
            isClosed = true;
            console.log("[User WS Proxy] Closing connections");
            try {
                clientWs.close();
            } catch {}
            if (polyWs) {
                try {
                    polyWs.close();
                } catch {}
            }
        };

        try {
            polyWs = new WebSocket("wss://ws-subscriptions-clob.polymarket.com/ws/user", {
                agent: customHttpsAgent
            });
        } catch (err: any) {
            console.error("[User WS Proxy] Error creating Polymarket WS connection:", err.message);
            closeConnections();
            return;
        }

        polyWs.on("open", () => {
            console.log("[User WS Proxy] Connected to Polymarket");
        });

        polyWs.on("message", (data: any) => {
            if (isClosed) return;
            try {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data.toString());
                }
            } catch (err: any) {
                console.error("[User WS Proxy] Error sending data to client:", err.message);
            }
        });

        polyWs.on("close", () => {
            console.log("[User WS Proxy] Polymarket connection closed");
            closeConnections();
        });

        polyWs.on("error", (err: any) => {
            console.error("[User WS Proxy] Polymarket connection error:", err.message);
            closeConnections();
        });

        clientWs.on("message", (data: any) => {
            if (isClosed) return;
            const messageStr = data.toString();

            const sendToPoly = () => {
                if (polyWs && polyWs.readyState === WebSocket.OPEN) {
                    polyWs.send(messageStr);
                } else if (polyWs && polyWs.readyState === WebSocket.CONNECTING) {
                    polyWs.once("open", () => {
                        if (!isClosed && polyWs.readyState === WebSocket.OPEN) {
                            polyWs.send(messageStr);
                        }
                    });
                }
            };
            sendToPoly();
        });

        clientWs.on("close", () => {
            console.log("[User WS Proxy] Client connection closed");
            closeConnections();
        });

        clientWs.on("error", (err: any) => {
            console.error("[User WS Proxy] Client connection error:", err.message);
            closeConnections();
        });
    });

    server.listen(port, () => {
        console.log(`  🔗 Website & Health server live on port ${port}`);
        console.log(`  🌍 Visit http://localhost:${port} to see the landing page`);
        console.log(`  📡 BTC price WebSocket proxy live at ws://…/ws/btcprice`);
    });

    // Ensure no old webhooks are blocking long polling
    if (!process.env.NO_BOT) {
        try {
            console.log("  Checking for existing webhooks...");
            // Use bot instance directly
            await bot.api.deleteWebhook({ drop_pending_updates: true });
            console.log("  ✅ Webhook deleted (or none existed). Starting polling...");
        } catch (err: any) {
            console.log("  ⚠️ Webhook delete minor error:", err.message);
        }

        // Give old instance 3 seconds to die (prevents 409 Conflict during zero-downtime redeploy)
        console.log("  ⏳ Waiting 3s for old instances to clear...");
        await new Promise(r => setTimeout(r, 3000));

        bot.start({
            allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
            onStart: async (botInfo) => {
                console.log(`  ✅ Bot started! @${botInfo.username}`);
                console.log(`  💬 Send /start to @${botInfo.username} to begin`);

                // Update the Telegram Menu Button to point to /miniapp
                try {
                    const cacheBuster = `?v=${Date.now()}`;
                    await bot.api.setChatMenuButton({
                        menu_button: {
                            type: "web_app",
                            text: "Open App",
                            web_app: { url: `https://p2pfather.com/miniapp${cacheBuster}` }
                        }
                    });
                    console.log("  ✅ Menu button updated to /miniapp");
                } catch (e: any) {
                    console.log("  ⚠️ Menu button update failed:", e.message);
                }

                console.log("");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
                console.log("  Bot is running. Press Ctrl+C to stop.");
                console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            },
        });
    } else {
        console.log("  🚫 Bot polling disabled by NO_BOT env var.");
        console.log("  ✅ API Server only mode.");
    }
}

// Robust error logging
process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
    if (err.message.includes("Conflict")) {
        console.log("⚠️ Bot conflict detected. Only one instance should run.");
    }
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
});

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down bot...");
    bot.stop();
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down bot...");
    bot.stop();
    process.exit(0);
});

main().catch((err) => {
    console.error("❌ Fatal error:", err);
    process.exit(1);
});
