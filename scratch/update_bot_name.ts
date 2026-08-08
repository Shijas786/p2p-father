import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
    process.exit(1);
}

const bot = new Bot(token);

async function updateName() {
    const newName = "P2pFatherBot | P2p Trades";
    console.log(`🚀 Updating bot display name to: "${newName}"...`);

    const me = await bot.api.getMe();
    console.log(`🤖 Target Bot: @${me.username} [ID: ${me.id}]`);

    await bot.api.setMyName(newName);
    console.log(`✅ Bot name successfully updated to: "${newName}"`);
}

updateName().catch(console.error);
