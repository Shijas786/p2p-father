import { Bot, InlineKeyboard } from "grammy";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
    process.exit(1);
}

const bot = new Bot(token);
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

const text = `Hey everyone! 👋\n\nHope you're all having a great day! Just a quick heads-up — we’ve smoothly switched over to our new official bot <b>@P2p_fatherbot</b>! 💙\n\nEverything is 100% back to normal, completely safe, and working super fast.\n\nYou can jump right back into trading whenever you're ready! Tap below to open the bot 👇`;

const keyboard = new InlineKeyboard()
    .url("💙 Open @P2p_fatherbot 😊", "https://t.me/P2p_fatherbot");

async function postAnnouncement() {
    console.log("🚀 Posting official announcement...");

    const targetChats = ["@P2pFather0"];
    if (process.env.COMMUNITY_CHAT_ID) {
        targetChats.push(process.env.COMMUNITY_CHAT_ID);
    }

    if (supabase) {
        const { data: groupsData } = await supabase.from("bot_groups").select("chat_id");
        if (groupsData) {
            groupsData.forEach((g: any) => {
                if (!targetChats.includes(g.chat_id.toString())) {
                    targetChats.push(g.chat_id.toString());
                }
            });
        }
    }

    const uniqueTargets = Array.from(new Set(targetChats));

    for (const chat of uniqueTargets) {
        try {
            console.log(`Sending message to ${chat}...`);
            const sentMsg = await bot.api.sendMessage(chat, text, {
                parse_mode: "HTML",
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
            console.log(`✅ Posted to ${chat} (Message ID: ${sentMsg.message_id})`);

            try {
                await bot.api.pinChatMessage(chat, sentMsg.message_id);
                console.log(`📌 Pinned message in ${chat}`);
            } catch (pinErr: any) {
                console.log(`ℹ️ Pin skipped for ${chat}: ${pinErr.message}`);
            }
        } catch (err: any) {
            console.error(`⚠️ Could not post to ${chat}: ${err.message}`);
        }
    }

    console.log("🎉 Announcement posting completed!");
}

postAnnouncement();
