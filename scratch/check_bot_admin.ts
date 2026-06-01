import { Bot } from "grammy";
import { groupManager } from "../src/utils/groupManager";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("No token");
    process.exit(1);
}
const bot = new Bot(token);

async function main() {
    const groups = await groupManager.getGroups();
    const botInfo = await bot.api.getMe();
    
    for (const gid of groups) {
        try {
            const member = await bot.api.getChatMember(gid, botInfo.id);
            console.log(`Group ID: ${gid}, Bot status: ${member.status}`);
        } catch (e: any) {
            console.error(`Group ID: ${gid}, Error: ${e.message}`);
        }
    }
}

main().catch(console.error);
