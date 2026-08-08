import { Bot, InlineKeyboard } from "grammy";

const botToken = "BOT_TOKEN_REDACTED";
const bot = new Bot(botToken);

const welcomeText = `👋 <b>WELCOME TO P2P FATHER!</b> 🎩\n\nThe safest decentralized P2P exchange inside Telegram. Trade USDT with <b>0% platform fees</b>, instant local payouts, and <b>Smart Contract Escrow</b> protection!\n\n👇 <b>Tap below to join our community & start trading:</b>`;

const keyboard = new InlineKeyboard()
    .url("💬 Join P2P Father Group (@P2PFather0)", "https://t.me/P2PFather0").row()
    .url("🚀 Open Mini App", "https://p2pfather.com")
    .url("⚡ Official Bot", "https://t.me/P2PFatherBot");

bot.command("start", async (ctx) => {
    try {
        await ctx.reply(welcomeText, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    } catch (e) {
        console.error("Error sending welcome message:", e.message);
    }
});

// Fallback for any incoming message
bot.on("message", async (ctx) => {
    try {
        await ctx.reply(welcomeText, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    } catch (e) {
        console.error("Error sending message:", e.message);
    }
});

async function init() {
    try {
        console.log("Cleaning webhook & pending updates...");
        await bot.api.deleteWebhook({ drop_pending_updates: true });
        console.log("✅ Webhook deleted cleanly.");
        
        console.log("🚀 P2P Father Redirect Bot starting long polling on @ticketonhorariobot...");
        await bot.start();
    } catch (err) {
        console.error("Fatal startup error:", err);
    }
}

init();
