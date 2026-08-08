import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
    process.exit(1);
}

const bot = new Bot(token);

async function updateBotProfile() {
    console.log("🚀 Updating bot profile settings...");

    const me = await bot.api.getMe();
    console.log(`🤖 Target Bot: @${me.username} (${me.first_name}) [ID: ${me.id}]`);

    // 1. Update Bot Display Name
    await bot.api.setMyName("P2P Father");
    console.log("✅ Name updated to 'P2P Father'");

    // 2. Update Short Description (Bio shown on profile page)
    await bot.api.setMyShortDescription(
        "⚡ 0% Fee Telegram P2P Exchange with Smart Contract Escrow. Join official group: https://t.me/P2pFather0"
    );
    console.log("✅ Bio / Short Description updated");

    // 3. Update Full Description (Shown before starting bot)
    await bot.api.setMyDescription(
        "🛡️ Welcome to P2P Father!\n\nThe safest decentralized P2P exchange inside Telegram. Trade USDT with 0% platform fees, instant local payouts, and smart contract escrow protection.\n\n👉 Official Group: https://t.me/P2pFather0\n🌐 Web App: https://p2pfather.com"
    );
    console.log("✅ Main Description updated");

    // 4. Update Commands Menu
    await bot.api.setMyCommands([
        { command: "start", description: "🚀 Start P2P Father Bot" },
        { command: "open", description: "📱 Open Telegram Mini App" },
        { command: "buy", description: "🟢 Buy USDT" },
        { command: "sell", description: "🔴 Sell USDT" },
        { command: "profile", description: "👤 View Profile & Wallet Balance" },
        { command: "group", description: "💬 Join Official Group" }
    ]);
    console.log("✅ Bot Menu Commands updated");

    console.log("\n🎉 Bot profile & settings successfully updated!");
}

updateBotProfile().catch((err) => {
    console.error("❌ Failed to update bot profile:", err);
});
