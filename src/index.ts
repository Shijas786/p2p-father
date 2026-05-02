import { bot } from "./bot";
import { env } from "./config/env";
import { db } from "./db/client"; // Import DB for stats
import express from "express";
import path from "path";
import { miniappRouter } from "./api/miniapp";

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

    // Start the bot
    console.log("  Starting Telegram bot (long polling)...");

    // Background Jobs
    if (env.NODE_ENV !== 'test') {
        const { startExpiryJob, startLiquiditySyncJob } = await import("./services/jobs");
        const { escrow } = await import("./services/escrow");
        startExpiryJob();
        startLiquiditySyncJob(escrow);
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

    app.listen(port, () => {
        console.log(`  🔗 Website & Health server live on port ${port}`);
        console.log(`  🌍 Visit http://localhost:${port} to see the landing page`);
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
