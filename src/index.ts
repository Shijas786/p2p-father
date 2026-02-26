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
            res.json({
                total_users: stats.total_users,
                total_volume_usdc: stats.total_volume_generic || 0,
                total_fees_amount: stats.total_fees_amount || 0,
                active_orders: stats.active_orders,
                fee_percentage: env.FEE_PERCENTAGE,
                fee_bps: parseInt(env.FEE_BPS)
            });
        } catch (e) {
            console.error("API Error:", e);
            res.status(500).json({ error: "Failed to fetch stats" });
        }
    });

    // Health Check (Koyeb needs a 200 OK)
    app.get("/health", (req, res) => res.send("OK"));

    // Mini App SPA fallback — also set no-cache headers
    app.get("/app/{*path}", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });
    app.get("/miniapp/{*path}", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });

    // Guide page
    app.get("/guide", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "guide.html"));
    });

    // Fallback file serving (Express v5 uses {*path} instead of *)
    app.get("/{*path}", (req, res) => {
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
                    await bot.api.setChatMenuButton({
                        menu_button: {
                            type: "web_app",
                            text: "Open App",
                            web_app: { url: "https://p2pfather.up.railway.app/miniapp" }
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
