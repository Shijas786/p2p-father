import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

async function main() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error("❌ TELEGRAM_BOT_TOKEN not found in .env");
        process.exit(1);
    }

    const bot = new Bot(token);
    const miniAppUrl = "https://www.p2pfather.com/app/";

    console.log("⏳ Configuring bot menu button via API...");

    try {
        // Set the Menu Button (bottom left) to open the Mini App
        await bot.api.setChatMenuButton({
            menu_button: {
                type: "web_app",
                text: "Open P2P App",
                web_app: {
                    url: miniAppUrl
                }
            }
        });

        console.log("✅ Menu Button configured successfully!");

        // Set Basic Commands
        await bot.api.setMyCommands([
            { command: "start", description: "Start the bot" },
            { command: "app", description: "Open Mini App" },
            { command: "wallet", description: "View Wallet" },
            { command: "mytrades", description: "Active Trades" },
        ]);

        console.log("✅ Bot commands configured!");

        const botInfo = await bot.api.getMe();
        console.log(`\n🚀 Bot @${botInfo.username} is now configured!`);
        console.log(`You can now open the bot and see the 'Open P2P App' button.`);

    } catch (error: any) {
        console.error("❌ Failed to configure bot:", error.message);
    }
}

main();
