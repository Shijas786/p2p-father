// Force hot reload
import { bot } from "./bot";
import { env } from "./config/env";
import { db } from "./db/client"; // Import DB for stats
import express from "express";
import path from "path";
import axios from "axios";

import { miniappRouter } from "./api/miniapp";
import { webhookRouter } from "./api/webhook";
import { whatsappWebhookRouter } from "./api/whatsappWebhook";

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
        const { startExpiryJob, startLiquiditySyncJob, startTradeReconciliationJob } = await import("./services/jobs");
        const { escrow } = await import("./services/escrow");
        const { startMetaWhatsAppMonitor } = await import("./services/wa-meta-monitor");
        
        // 🚀 Start background services
        startExpiryJob();
        startLiquiditySyncJob(escrow);
        startTradeReconciliationJob();
        startMetaWhatsAppMonitor(); // 🔍 Track Meta WhatsApp Web client updates & alert Admin on TG
    }

    // Hypermeow Go bridge is the active WhatsApp engine — Baileys removed
    console.log("  🟢 WhatsApp engine: Hypermeow (Go bridge)");


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

    // Mount API Routers
    app.use("/api/miniapp", miniappRouter);
    app.use("/api/webhook", webhookRouter);
    app.use("/api/whatsapp", whatsappWebhookRouter);

    // Serve Mini App frontend — NUCLEAR NO CACHING
    const miniAppDist = path.join(process.cwd(), "miniapp", "dist");
    const noCacheHeaders = (res: any) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.setHeader("Surrogate-Control", "no-store");
    };
    const staticOpts = { setHeaders: noCacheHeaders, etag: false, lastModified: false, redirect: false };
    // Serve index.html directly on /miniapp and /miniapp/ without any 301 redirect
    app.get(["/miniapp", "/miniapp/"], (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });
    app.use("/miniapp", express.static(miniAppDist, staticOpts));
    app.get(/^\/miniapp(?:\/.*)?$/, (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(miniAppDist, "index.html"));
    });

    // Serve WhatsApp Web App (/webapp) — Standalone ChatterPay-style WhatsApp OTP Login page
    app.get("/webapp", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "webapp.html"));
    });
    app.get("/webapp/", (req, res) => {
        noCacheHeaders(res);
        res.sendFile(path.join(process.cwd(), "public", "webapp.html"));
    });

    // WhatsApp QR Code Web API & Interface (Secured via secret key)
    app.get("/api/wa-qr", async (req, res) => {
        try {
            const secret = req.query.secret as string;
            if (!env.WA_ADMIN_SECRET || secret !== env.WA_ADMIN_SECRET) {
                return res.status(403).json({ error: "Unauthorized access" });
            }

            const { hypermeowClient } = await import("./whatsapp/hypermeowClient");
            if (hypermeowClient.isConfigured()) {
                const health = await hypermeowClient.checkHealth();
                const rawQr = await hypermeowClient.getQrCode();
                let qrDataUrl: string | null = null;
                if (rawQr) {
                    try {
                        const QRCode = await import("qrcode");
                        qrDataUrl = await QRCode.toDataURL(rawQr);
                    } catch (_) {}
                }
                res.json({
                    connected: health.connected,
                    qr: qrDataUrl,
                    provider: "hypermeow",
                });
                return;
            }


            // Baileys disabled — Hypermeow is the active engine
            res.json({ connected: false, qr: null, provider: "none" });
        } catch (e) {
            res.json({ connected: false, qr: null, provider: "unknown" });
        }
    });

    app.post("/api/wa-restart", async (req, res) => {
        try {
            const secret = (req.query.secret as string) || (req.body?.secret as string);
            if (!env.WA_ADMIN_SECRET || secret !== env.WA_ADMIN_SECRET) {
                return res.status(403).json({ error: "Unauthorized access" });
            }
            const axios = (await import("axios")).default;
            const hypermeowUrl = process.env.HYPERMEOW_URL || "http://localhost:8085";
            await axios.post(`${hypermeowUrl}/restart-qr`, {}, { timeout: 6000 });
            res.json({ ok: true, message: "Restarting WhatsApp QR code generator..." });
        } catch (e: any) {
            res.status(500).json({ error: e?.message || "Failed to restart QR" });
        }
    });

    app.get("/wa-qr", (req, res) => {
        const secret = (req.query.secret as string) || "";
        if (!env.WA_ADMIN_SECRET || secret !== env.WA_ADMIN_SECRET) {
            return res.status(403).send(`
                <body style="background:#0b0e14;color:#ff4d4d;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                    <div style="text-align:center;background:rgba(255,255,255,0.05);padding:40px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);">
                        <h1 style="margin-bottom:10px;">🔒 403 Access Denied</h1>
                        <p style="color:#8a99ad;">Invalid or missing secret key. Access to WhatsApp QR pairing is restricted.</p>
                    </div>
                </body>
            `);
        }

        res.setHeader("Content-Type", "text/html");
        res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P2PFather — WhatsApp Bot Connection</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #0b0e14; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(16px); border-radius: 24px; padding: 36px; text-align: center; max-width: 420px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .title { font-size: 24px; font-weight: 700; margin-bottom: 8px; background: linear-gradient(135deg, #25D366, #128C7E); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .subtitle { font-size: 14px; color: #8a99ad; margin-bottom: 24px; }
        .qr-box { background: #fff; padding: 12px; border-radius: 16px; display: flex; align-items: center; justify-content: center; min-height: 250px; min-width: 250px; margin: 0 auto 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        img { display: block; width: 230px; height: 230px; border-radius: 8px; }
        .status { font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 50px; background: rgba(255,255,255,0.08); color: #fff; }
        .dot { width: 10px; height: 10px; border-radius: 50%; background: #eab308; animation: pulse 1.5s infinite; }
        .dot.connected { background: #22c55e; animation: none; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .instructions { font-size: 13px; color: #8a99ad; line-height: 1.6; text-align: left; background: rgba(0,0,0,0.2); padding: 16px; border-radius: 12px; margin-top: 20px; }
        .instructions ol { padding-left: 18px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="title">📲 Connect WhatsApp Bot</div>
        <div class="subtitle">Scan this QR code with WhatsApp to pair P2PFather</div>
        <div class="qr-box">
            <img id="qr-img" style="display:none;" alt="WhatsApp QR Code" />
            <div id="loader" style="color: #666; font-size: 14px;">Loading QR code...</div>
        </div>
        <div style="margin-bottom: 20px;">
            <button id="refresh-btn" onclick="forceRefreshQr()" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 8px 18px; border-radius: 50px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px;">
                🔄 Refresh QR Code
            </button>
        </div>
        <div class="status" id="status">
            <span class="dot" id="dot"></span>
            <span id="status-text">Connecting...</span>
        </div>
        <div class="instructions">
            <strong>How to link:</strong>
            <ol style="margin-top: 6px;">
                <li>Open <b>WhatsApp</b> on your phone</li>
                <li>Tap <b>Settings ⚙️</b> → <b>Linked Devices</b></li>
                <li>Tap <b>Link a Device</b> and point camera here</li>
            </ol>
        </div>
    </div>

    <script>
        const secret = new URLSearchParams(window.location.search).get('secret') || '';
        async function updateQr() {
            try {
                const res = await fetch('/api/wa-qr?secret=' + encodeURIComponent(secret));
                if (res.status === 403) {
                    document.getElementById('loader').innerText = "🔒 403 Unauthorized Secret";
                    document.getElementById('status-text').innerText = "Access Denied";
                    return;
                }
                const data = await res.json();
                const statusText = document.getElementById('status-text');
                const dot = document.getElementById('dot');
                const qrImg = document.getElementById('qr-img');
                const loader = document.getElementById('loader');

                if (data.connected) {
                    statusText.innerText = "WhatsApp Connected!";
                    statusText.style.color = "#22c55e";
                    dot.className = "dot connected";
                    loader.innerText = "✅ Bot Online & Active!";
                    loader.style.display = "block";
                    loader.style.color = "#22c55e";
                    loader.style.fontWeight = "bold";
                    qrImg.style.display = "none";
                } else if (data.qr) {
                    statusText.innerText = "Waiting for scan...";
                    dot.className = "dot";
                    qrImg.src = data.qr;
                    qrImg.style.display = "block";
                    loader.style.display = "none";
                } else {
                    statusText.innerText = "Initializing WhatsApp...";
                    loader.innerText = "Generating fresh QR...";
                    loader.style.display = "block";
                    qrImg.style.display = "none";
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function forceRefreshQr() {
            const btn = document.getElementById('refresh-btn');
            const loader = document.getElementById('loader');
            const qrImg = document.getElementById('qr-img');
            btn.disabled = true;
            btn.style.opacity = "0.5";
            loader.innerText = "Requesting new QR from WhatsApp...";
            loader.style.display = "block";
            qrImg.style.display = "none";
            try {
                await fetch('/api/wa-restart?secret=' + encodeURIComponent(secret), { method: 'POST' });
                setTimeout(updateQr, 800);
            } catch (e) {
                console.error(e);
            } finally {
                setTimeout(() => {
                    btn.disabled = false;
                    btn.style.opacity = "1";
                }, 2500);
            }
        }

        updateQr();
        setInterval(updateQr, 2500);
    </script>
</body>
</html>`);
    });

    // Serve static files from public folder
    app.use(express.static(path.join(process.cwd(), "public")));

    // API Stats Endpoint (Consumed by the frontend)
    app.get("/api/stats", async (req, res) => {
        try {
            const stats = await db.getStats();

            res.json({
                total_users: stats.total_users,
                total_trades: stats.completed_trades,
                total_volume_usdc: stats.total_volume_generic || 0,
                total_fees_amount: stats.total_fees_amount || 0,
                active_orders: stats.active_orders,
                fee_percentage: env.FEE_PERCENTAGE,
                fee_bps: parseInt(env.FEE_BPS),
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
                    { seller_name: "Alice", buyer_name: "AlexK", amount: 500, token: "USDT", chain: "bsc", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=BIBI", tx_hash: "0x34ba12cb02aa11cd" },
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

    // Debug dist files
    app.get('/debug-dist', (req, res) => {
        const fs = require('fs');
        const distFiles = fs.existsSync(miniAppDist) ? fs.readdirSync(miniAppDist) : [];
        const assetsPath = path.join(miniAppDist, "assets");
        const assetFiles = fs.existsSync(assetsPath) ? fs.readdirSync(assetsPath).filter((f: string) => f.startsWith("index")) : [];
        res.json({ miniAppDist, distFiles, assetFiles });
    });

    // Mini App SPA fallback — exclude /assets/ so missing JS/CSS returns 404 instead of HTML
    app.get(/^\/(?:app|miniapp)(?!\/assets\/)(?:\/.*)?$/, (req, res) => {
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

    server.listen(Number(port), '0.0.0.0', () => {
        console.log(`  🔗 Website & Health server live on port ${port} (0.0.0.0)`);
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
