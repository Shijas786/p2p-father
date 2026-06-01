import { Bot } from "grammy";
import { groupManager } from "../src/utils/groupManager";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("TELEGRAM_BOT_TOKEN is missing in env");
    process.exit(1);
}

const bot = new Bot(token);

async function run() {
    try {
        const groupIds = await groupManager.getGroups();
        console.log(`Analyzing ${groupIds.length} registered chat IDs...\n`);
        
        for (const id of groupIds) {
            try {
                const chat = await bot.api.getChat(id);
                let name = "Unknown";
                
                if ('title' in chat) {
                    name = chat.title;
                } else if ('first_name' in chat) {
                    name = `${chat.first_name} ${chat.last_name || ''}`.trim();
                }
                
                const type = chat.type;
                console.log(`- ID: ${id} | Type: ${type.padEnd(10)} | Name: ${name}`);
            } catch (e: any) {
                console.log(`- ID: ${id} | Error: ${e.message}`);
            }
            
            // Add small delay to respect rate limits
            await new Promise(r => setTimeout(r, 200));
        }
        process.exit(0);
    } catch (err) {
        console.error("Main loop error:", err);
        process.exit(1);
    }
}

run();
