import { Bot, InlineKeyboard } from "grammy";
import { env } from "../src/config/env";

async function run() {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    // Use an admin ID to test
    const adminId = env.ADMIN_IDS[0];
    try {
        console.log("Sending...");
        await bot.api.sendMessage(adminId, "🌟 *Market is Quiet* 🌟\n\nThere are no active orders right now\\.\n\n✨ Be the first to list an ad and set your own price\\! 🚀", {
            parse_mode: "MarkdownV2",
            reply_markup: new InlineKeyboard().webApp("✨ Create Ad", "https://p2pfather.com/miniapp/create")
        });
        console.log("Success!");
    } catch (err) {
        console.error("Error:", err);
    }
}
run();
