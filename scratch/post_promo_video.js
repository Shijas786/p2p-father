import { Bot, InlineKeyboard, InputFile } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN is missing in .env");
    process.exit(1);
}

const bot = new Bot(token);

const videoPath = "/Users/shijas/Downloads/p2pfather telgrm.mp4";

const caption = `🔥 <b>ATTENTION COMMUNITY! MEET P2P FATHER!</b> 🔥\n\nLooking for a fast, zero-fee, and ultra-secure way to trade crypto directly on Telegram?\n\n🛡️ <b>P2P Father</b> is Telegram's next-gen P2P Exchange powered by <b>Smart Contract Escrow</b>!\n\n🎯 <b>Why Join P2P Father?</b>\n✅ <b>0% Platform Fees</b> on launch trades\n✅ <b>100% On-Chain Escrow Security</b> (Sellers can't run off with your crypto)\n✅ <b>Instant Local Payouts</b> via UPI, IMPS, GPay & Bank Transfer\n✅ <b>Built-in Telegram Mini App</b> — No external app download required!\n✅ <b>24/7 Live Dispute Admin Support</b>\n\n👉 <b>Join our official community group to start trading safely today!</b> 👇`;

const keyboard = new InlineKeyboard()
    .url("💬 Join P2P Father Group", "https://t.me/P2PFather0").row()
    .url("🚀 Launch Bot", "https://t.me/P2PFatherBot")
    .url("🌐 Open Mini App", "https://p2pfather.com");

// Target channels / groups
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["@botio_devs"];

async function run() {
    for (const target of targets) {
        console.log(`\n📤 Sending video promo to ${target}...`);
        try {
            const sentMsg = await bot.api.sendVideo(target, new InputFile(videoPath), {
                caption: caption,
                parse_mode: "HTML",
                reply_markup: keyboard
            });
            console.log(`✅ Posted successfully to ${target}! Message ID: ${sentMsg.message_id}`);

            try {
                await bot.api.pinChatMessage(target, sentMsg.message_id, { disable_notification: false });
                console.log(`📌 Message pinned successfully in ${target}!`);
            } catch (pinErr) {
                console.log(`⚠️ Note: Could not pin in ${target} (bot needs 'Pin Messages' admin permission): ${pinErr.message}`);
            }
        } catch (err) {
            console.error(`❌ Failed posting to ${target}: ${err.message}`);
        }
    }
}

run();
