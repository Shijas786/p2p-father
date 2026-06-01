import { Bot } from "grammy";
import { env } from "../src/config/env";

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

async function main() {
    const me = await bot.api.getMe();
    console.log("Bot Info:", me);
    const webhook = await bot.api.getWebhookInfo();
    console.log("Webhook Info:", webhook);
}

main().catch(console.error);
