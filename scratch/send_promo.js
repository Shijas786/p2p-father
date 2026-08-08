import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing in .env");
    process.exit(1);
}

const targetChat = process.argv[2] || "@P2PFather0";

const bot = new Bot(token);

async function run() {
    console.log(`🚀 Sending promo message with inline buttons to ${targetChat}...`);
    
    const botLink = process.env.BOT_USERNAME ? `https://t.me/${process.env.BOT_USERNAME}` : "https://t.me/P2PFatherBot";
    const webUrl = process.env.WEBAPP_URL || "https://p2pfather.com";
    const groupLink = process.env.COMMUNITY_INVITE_LINK || "https://t.me/P2PFatherGroup";

    const text = `⚡ <b>TIRED OF P2P SCAMS & BANK FREEZES? MEET P2P FATHER!</b> ⚡\n\nTrading P2P without proper smart contract escrow is risky. Upgrade your trading experience today!\n\n🔥 <b>Why Trade With P2P Father?</b>\n🔒 <b>Smart Contract Escrow</b>: Funds are locked safely on-chain until payment is verified.\n⚡ <b>Instant Local Payouts</b>: UPI, IMPS, GPay & Direct Bank Transfer.\n⚖️ <b>3-Way Live Dispute Resolution</b>: Dedicated admins step in within minutes if needed.\n🎉 <b>0% Platform Fees</b>: Enjoy 100% of your profits during our launch promo!\n\nJoin thousands of traders moving to decentralized P2P safety! 👇`;

    const keyboard = new InlineKeyboard()
        .url("🚀 Launch Trading Bot", botLink).row()
        .url("🌐 Open Mini App", webUrl)
        .url("📢 Official Community", groupLink);

    try {
        const sentMsg = await bot.api.sendMessage(targetChat, text, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
        console.log(`✅ Message sent successfully! Message ID: ${sentMsg.message_id}`);
        
        try {
            await bot.api.pinChatMessage(targetChat, sentMsg.message_id, { disable_notification: false });
            console.log(`📌 Message pinned successfully in ${targetChat}!`);
        } catch (pinErr) {
            console.log(`⚠️ Could not pin message (bot may need admin rights in group to pin): ${pinErr.message}`);
        }
    } catch (err) {
        console.error(`❌ Failed to send message to ${targetChat}:`, err.message);
    }
}

run();
