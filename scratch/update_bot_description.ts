import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing");
    process.exit(1);
}

const bot = new Bot(token);

async function updateDescription() {
    console.log("🚀 Updating Bot Description on Telegram...");

    const descriptionText = [
        "🛡️ Welcome to P2P Father!",
        "",
        "The safest decentralized P2P exchange inside Telegram. Buy and sell USDT & USDC with smart contract escrow protection and instant local payouts.",
        "",
        "👉 Official Group: https://t.me/P2pFather0",
        "🌐 Web App: https://p2pfather.com"
    ].join("\n");

    await bot.api.setMyDescription(descriptionText);
    await bot.api.setMyShortDescription("Safest decentralized P2P exchange inside Telegram with smart contract escrow protection.");

    console.log("✅ Successfully updated Bot Description on Telegram!");
}

updateDescription().catch(console.error);
