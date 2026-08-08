import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
    process.exit(1);
}

const bot = new Bot(token);

async function setupMenuButton() {
    console.log("🚀 Setting up Telegram Chat Menu Button...");

    const me = await bot.api.getMe();
    console.log(`🤖 Target Bot: @${me.username} (${me.first_name}) [ID: ${me.id}]`);

    // Set bottom-left Menu Button to open Mini App directly
    await bot.api.setChatMenuButton({
        menu_button: {
            type: "web_app",
            text: "Open App 📱",
            web_app: { url: "https://p2pfather.com/miniapp" }
        }
    });

    console.log("✅ Chat Menu Button successfully updated to 'Open App 📱' pointing to https://p2pfather.com/miniapp!");
}

setupMenuButton().catch(console.error);
