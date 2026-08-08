import { Bot, InlineKeyboard } from "grammy";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!token || !supabaseUrl || !supabaseKey) {
    console.error("❌ Missing environment variables (TELEGRAM_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY)");
    process.exit(1);
}

const bot = new Bot(token);
const supabase = createClient(supabaseUrl, supabaseKey);

const groupLink = "https://t.me/P2pFather0";

const text = `Hey friend! 👋\n\nWe noticed you're using our bot here, but we want to make sure you're in our <b>Official Group</b>! 💙\n\nTo keep all our members safe from confusion or unverified groups, we strongly encourage everyone to join our official home. That way you always get genuine updates, official support, and stay 100% secure! 🛡️\n\nWe'd love to see you there! Tap below to join us 👇`;

const keyboard = new InlineKeyboard()
    .url("💙 Join Our Official Group 😊", groupLink);

async function run() {
    console.log("🔍 Fetching bot info...");
    try {
        const me = await bot.api.getMe();
        console.log(`🤖 Connected to bot: @${me.username} (${me.first_name}) [ID: ${me.id}]`);
    } catch (e: any) {
        console.error("❌ Failed to connect to bot with TELEGRAM_BOT_TOKEN:", e.message);
        return;
    }

    console.log("🔍 Fetching target recipients (groups & direct users)...");

    // 1. Fetch Groups
    const { data: groupsData, error: groupsErr } = await supabase
        .from("bot_groups")
        .select("chat_id");
    
    if (groupsErr) {
        console.error("Error fetching bot_groups:", groupsErr.message);
    }

    const groupIds: Array<string | number> = (groupsData || []).map((g: any) => g.chat_id);

    // 2. Fetch Users with telegram_id
    const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("telegram_id")
        .not("telegram_id", "is", null);

    if (usersErr) {
        console.error("Error fetching users:", usersErr.message);
    }

    const userIds: Array<string | number> = (usersData || [])
        .map((u: any) => u.telegram_id)
        .filter((id: any) => Boolean(id));

    // Deduplicate all targets
    const allTargets = Array.from(new Set([...groupIds, ...userIds]));

    console.log(`📊 Found ${groupIds.length} groups and ${userIds.length} unique registered users.`);
    console.log(`📢 Total unique broadcast targets: ${allTargets.length}`);

    if (allTargets.length === 0) {
        console.log("⚠️ No targets found to send message to.");
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < allTargets.length; i++) {
        const targetId = allTargets[i];
        let sent = false;
        let retries = 0;

        while (!sent && retries < 2) {
            try {
                await bot.api.sendMessage(targetId, text, {
                    parse_mode: "HTML",
                    reply_markup: keyboard,
                    disable_web_page_preview: true
                });
                successCount++;
                sent = true;
                if ((i + 1) % 10 === 0 || i === allTargets.length - 1) {
                    console.log(`[${i + 1}/${allTargets.length}] 📊 Progress: ${successCount} succeeded, ${failCount} failed`);
                }
            } catch (err: any) {
                if (err.parameters?.retry_after) {
                    const waitTime = (err.parameters.retry_after + 1) * 1000;
                    console.log(`⏳ Rate limited. Waiting ${waitTime / 1000}s...`);
                    await new Promise(r => setTimeout(r, waitTime));
                    retries++;
                } else {
                    failCount++;
                    sent = true; // don't retry permanent errors (blocked, user deleted, chat not found)
                }
            }
        }

        // Telegram limit for broadcasting is ~30 msgs/sec, safe delay 50ms
        await new Promise((r) => setTimeout(r, 50));
    }

    console.log(`\n🎉 Broadcast completed!`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed / Blocked: ${failCount}`);
}

run();
