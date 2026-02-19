import { Bot, Context, session, InlineKeyboard } from "grammy";
import { env } from "../config/env";
import { db } from "../db/client";
import { ai } from "../services/ai";
import { escrow } from "../services/escrow";
import { bridge } from "../services/bridge";
import { wallet } from "../services/wallet";
import { groupManager } from "../utils/groupManager";
import {
    formatOrder,
    formatINR,
    formatUSDC,
    formatTradeStatus,
    formatTimeRemaining,
    truncateAddress,
    formatShortDate,
} from "../utils/formatters";
import type { SessionData, User } from "../types";

// ═══════════════════════════════════════════════════════════════
//                      BOT SETUP
// ═══════════════════════════════════════════════════════════════

type BotContext = Context & { session: SessionData };

const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN);

// Initialize Logger
import { logger } from "../utils/logger";
logger.init(bot);

// GLOBAL DEBUG LOGGER
bot.use(async (ctx, next) => {
    // Log only if it's a message to avoid spamming other updates like poll answers/etc if not needed
    if (ctx.message || ctx.channelPost) {
        logger.info("DEBUG", `Update received: ${JSON.stringify(ctx.update, null, 2)}`);
    }
    await next();
});

// Session middleware
bot.use(
    session({
        initial: (): SessionData => ({
            conversation_history: [],
        }),
    })
);


// ═══════════════════════════════════════════════════════════════
//                    HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function getExplorerUrl(txHash: string, chain: 'base' | 'bsc' = 'base'): string {
    const baseUrl = chain === 'base' ? "https://basescan.org" : "https://bscscan.com";
    return `${baseUrl}/tx/${txHash}`;
}

async function broadcast(message: string, keyboard?: InlineKeyboard) {
    const groups = groupManager.getGroups();
    // Include ENV broadcast channel if set
    if (env.BROADCAST_CHANNEL_ID) {
        const adminChannel = Number(env.BROADCAST_CHANNEL_ID);
        if (!isNaN(adminChannel) && !groups.includes(adminChannel)) {
            groups.push(adminChannel);
        }
    }

    if (groups.length === 0) return;

    console.log(`📡 Broadcasting to ${groups.length} groups...`);

    // Add deep link button to message if not present in keyboard? 
    // Actually the message usually contains links.

    await Promise.allSettled(groups.map(async (chatId) => {
        try {
            await bot.api.sendMessage(chatId, message, { parse_mode: "Markdown", reply_markup: keyboard });
        } catch (error: any) {
            // Remove group if bot was kicked
            if (error.description?.includes("kicked") || error.description?.includes("blocked") || error.description?.includes("not a member")) {
                console.log(`❌ Removing invalid group ${chatId}`);
                groupManager.removeGroup(chatId);
            } else {
                console.error(`⚠️ Broadcast failed to ${chatId}:`, error.message);
            }
        }
    }));
}

export async function broadcastTradeSuccess(trade: any, order: any) {
    try {
        const groupVal = (order.payment_details as any)?.group_id;
        const targetGroup = typeof groupVal === 'number' ? groupVal : undefined;

        if (targetGroup) {
            await bot.api.sendMessage(
                String(targetGroup),
                `🔥 *JUST SOLD!* 🚀\n\nSomeone just bought *${formatUSDC(trade.amount * 0.995)}* from @${trade.seller_username || "Seller"}!\n\n⚡ P2P Kerala is active. /start to trade.`,
                { parse_mode: "Markdown" }
            ).catch(e => console.error(`Group FOMO Broadcast failed:`, e));
        }
    } catch (e) {
        console.error("BroadcastSuccess error:", e);
    }
}

export async function broadcastAd(order: any, user: any) {
    try {
        const botUser = await bot.api.getMe();
        // Explicitly cast to prevent lint errors
        const groupVal = (order.payment_details as any)?.group_id;
        const targetGroup = typeof groupVal === 'number' ? groupVal : undefined;

        if (targetGroup !== undefined) {
            // Post ONLY to that group
            await bot.api.sendMessage(
                String(targetGroup),
                `📢 *New Sell Ad!* 🚀\n\n💰 Sell: *${formatUSDC(order.amount)}*\n📈 Rate: *${formatINR(order.rate)}/USDC*\n👤 Seller: @${user.username || "Anonymous"}\n\n👉 [Buy Now](https://t.me/${botUser.username}?start=buy_${order.id})`,
                { parse_mode: "Markdown" }
            ).catch(e => console.error(`Group Broadcast failed to ${targetGroup}:`, e));

        } else if (env.BROADCAST_CHANNEL_ID) {
            // Fallback: Post to Main Channel for Direct DM ads
            await bot.api.sendMessage(
                env.BROADCAST_CHANNEL_ID,
                `📢 *New Sell Ad!* 🚀\n\n💰 Sell: *${formatUSDC(order.amount)}*\n📈 Rate: *${formatINR(order.rate)}/USDC*\n👤 Seller: @${user.username || "Anonymous"}\n\n👉 [Buy Now](https://t.me/${botUser.username}?start=buy_${order.id})`,
                { parse_mode: "Markdown" }
            ).catch(e => console.error("Main Channel Broadcast failed:", e));
        }
    } catch (e) {
        console.error("BroadcastAd error:", e);
    }
}

async function ensureUser(ctx: BotContext): Promise<User> {
    const from = ctx.from!;
    console.log(`DEBUG: ensureUser for ${from.id}...`);

    // Add a race to prevent hanging forever on DB issues
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database timeout in ensureUser")), 10000)
    );

    return Promise.race([
        db.getOrCreateUser(
            from.id,
            from.username || undefined,
            from.first_name || undefined
        ),
        timeout
    ]) as Promise<User>;
}

function isAdmin(ctx: BotContext): boolean {
    return env.ADMIN_IDS.includes(ctx.from?.id || 0);
}

// ═══════════════════════════════════════════════════════════════
//                     /start COMMAND
// ═══════════════════════════════════════════════════════════════

// 🛡️ Middleware: Restrict trading to Private Chats
// 🛡️ Middleware: Restrict trading to Private Chats + Deep Linking for Groups
bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== "private" && ctx.message?.text?.startsWith("/")) {
        const text = ctx.message.text!;
        const cmd = text.split(" ")[0].split("@")[0];
        const restricted = ["/newad", "/sell", "/buy", "/wallet", "/myads", "/mytrades", "/balance", "/deposit", "/withdraw"];

        if (restricted.includes(cmd)) {
            const username = ctx.me.username;
            const chatId = ctx.chat.id;
            // Redirect to DM with context
            const startPayload = (cmd === "/newad" || cmd === "/sell") ? `${cmd.replace("/", "")}_${chatId}` : "dm";

            await ctx.reply(`⚠️ Please [DM me](https://t.me/${username}?start=${startPayload}) to trade!`, { parse_mode: "Markdown" });
            return;
        }
    }
    await next();
});


// 🤖 Handle Groups: Automatically track where bot is added
bot.on("my_chat_member", async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const oldStatus = ctx.myChatMember.old_chat_member.status;
    const chat = ctx.chat;

    if (status === "member" || status === "administrator") {
        if (oldStatus === "left" || oldStatus === "kicked" || oldStatus === "restricted") {
            groupManager.addGroup(chat.id);
            await ctx.reply(
                "🚀 *P2P Kerala Bot Activated!*\n\nI will post live buy/sell ads here.",
                { parse_mode: "Markdown" }
            );
        }
    } else if (status === "left" || status === "kicked") {
        groupManager.removeGroup(chat.id);
    }
});

// 📢 Broadcast command (Admin Only)
bot.command("broadcast", async (ctx) => {
    if (!env.ADMIN_IDS.includes(ctx.from?.id || 0)) {
        return ctx.reply("❌ Unauthorized.");
    }
    const message = ctx.match?.toString().trim();
    if (!message) return ctx.reply("Usage: /broadcast [Message]");

    const userIds = await db.getAllTelegramIds();
    let sent = 0;

    await ctx.reply(`📢 Sending broadcast to ${userIds.length} users...`);

    for (const userId of userIds) {
        try {
            await ctx.api.sendMessage(userId, `📢 *Announcement*\n\n${message}`, { parse_mode: "Markdown" });
            sent++;
            await new Promise(r => setTimeout(r, 50)); // Rate limit safety
        } catch (e) { /* ignore blocked users */ }
    }
    await ctx.reply(`✅ Broadcast complete! Sent to ${sent}/${userIds.length} users.`);
});

bot.command("ping", async (ctx) => {
    await ctx.reply(`🏓 Pong! (Bot Version: ${new Date().toISOString()})`);
});

bot.command("start", async (ctx) => {
    // Handle Deep Linking
    const payload = ctx.match?.toString().trim();

    // 1. Group-specific Sell/NewAd
    if (payload && (payload.startsWith("newad_") || payload.startsWith("sell_"))) {
        const parts = payload.split("_");
        const groupId = parts[1]; // Capture group ID

        if (groupId) {
            // Set session for targeted ad creation
            ctx.session.ad_draft = {
                target_group_id: Number(groupId),
                type: "sell" // Default
            };

            await ctx.reply(
                [
                    "📢 *Create a New Ad*",
                    "",
                    "This ad will be posted to the group you came from!",
                    "",
                    "What do you want to do?",
                ].join("\n"),
                {
                    parse_mode: "Markdown",
                    reply_markup: new InlineKeyboard()
                        .text("🔴 I want to SELL crypto", "newad:sell")
                        .row()
                        .text("🟢 I want to BUY crypto", "newad:buy")
                }
            );
            return;
        }
    }

    // 🆕 HANDLE PRIVATE AD SETUP (Redirected from Group)
    if (payload && (payload.startsWith("setup_sell_") || payload.startsWith("setup_buy_"))) {
        const isSell = payload.startsWith("setup_sell_");
        const data = payload.replace(isSell ? "setup_sell_" : "setup_buy_", "");
        const parts = data.split("_");

        // Format: AMOUNT_RATE_GROUPID
        if (parts.length >= 3) {
            const amount = parseFloat(parts[0]);
            const rate = parseFloat(parts[1]);
            const groupId = parseInt(parts[2]); // Capture Group ID
            const user = await ensureUser(ctx);

            if (!isNaN(amount) && !isNaN(rate)) {
                // Initialize Draft Session
                ctx.session.ad_draft = {
                    type: isSell ? "sell" : "buy",
                    amount: amount,
                    rate: rate,
                    token: "USDC",
                    target_group_id: !isNaN(groupId) ? groupId : undefined
                };

                const callbackData = isSell
                    ? `confirm_sell:${amount}:${rate}:${user.id}`
                    : `confirm_buy:${amount}:${rate}:${user.id}`;

                const keyboard = new InlineKeyboard()
                    .text("✅ Confirm Order", callbackData)
                    .text("❌ Cancel", `cancel_action:${user.id}`);

                const totalFee = amount * env.FEE_PERCENTAGE; // 1%
                const sideFee = amount * 0.005;            // 0.5%
                const typeLabel = isSell ? "Sell" : "Buy";

                await ctx.reply(
                    [
                        `📝 *Create ${typeLabel} Order*`,
                        "",
                        `Amount: ${formatUSDC(amount)}`,
                        `Rate: ${formatINR(rate)}/USDC`,
                        `Total: ${formatINR(amount * 0.995 * rate)}`,
                        "",
                        `⚖️ *Commission (${(env.FEE_PERCENTAGE * 100).toFixed(0)}%)*:`,
                        `• Seller: ${(env.FEE_PERCENTAGE * 50).toFixed(1)}% (${formatUSDC(sideFee)})`,
                        `• Buyer: ${(env.FEE_PERCENTAGE * 50).toFixed(1)}% (${formatUSDC(sideFee)})`,
                        "",
                        isSell
                            ? `🔐 *You Lock:* ${formatUSDC(amount)}\n💰 *You Get Paid for:* ${formatUSDC(amount - sideFee)}\n📥 *Buyer Gets:* ${formatUSDC(amount - totalFee)}`
                            : `🔐 *Seller Locks:* ${formatUSDC(amount)}\n💰 *You Pay for:* ${formatUSDC(amount - sideFee)}\n📥 *You Get:* ${formatUSDC(amount - totalFee)}`,
                        "",
                        " Confirm to list this order?",
                    ].join("\n"),
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
                return;
            }
        }
    }

    // 2. Buy specific order
    if (payload && payload.startsWith("buy_")) {
        const orderId = payload.replace("buy_", "");
        const order = await db.getOrderById(orderId);
        if (order && order.status === "active") {
            const keyboard = new InlineKeyboard().text(`✅ View Ad & Buy`, `buy:${orderId}`);
            await ctx.reply(`🔍 *Viewing Ad #${orderId.slice(0, 8)}*`, { parse_mode: "Markdown", reply_markup: keyboard });
            return;
        } else {
            await ctx.reply("❌ Ad not found or no longer active.");
            return;
        }
    }

    const user = await ensureUser(ctx);

    // Auto-create wallet if user doesn't have one
    let walletInfo = "";
    let isNewUser = false;
    if (!user.wallet_address && env.MASTER_WALLET_SEED) {
        try {
            const derived = wallet.deriveWallet(user.wallet_index);
            await db.updateUser(user.id, { wallet_address: derived.address });
            isNewUser = true;
            walletInfo = [
                "",
                "🎉 *Wallet Created Automatically!*",
                `💳 Address: \`${derived.address}\``,
                "",
                "Your wallet is ready to receive USDC.",
            ].join("\n");
        } catch (err) {
            console.error("Wallet creation failed:", err);
        }
    } else if (user.wallet_address) {
        walletInfo = `\n💳 Wallet: \`${truncateAddress(user.wallet_address)}\``;
    }

    const upiStatus = user.upi_id
        ? `📱 UPI: \`${user.upi_id}\``
        : "📱 UPI: Not set";
    const phoneStatus = user.phone_number
        ? `📞 Phone: \`${user.phone_number}\``
        : "";
    const bankStatus = user.bank_account_number
        ? `🏦 Bank: \`${user.bank_account_number}\` (${user.bank_ifsc || ''})`
        : "";
    const paymentStatus = [upiStatus, phoneStatus, bankStatus].filter(Boolean).join("\n");
    const hasPayment = user.upi_id || user.phone_number || user.bank_account_number;

    const welcome = [
        `👋 *Welcome to P2P Kerala, ${ctx.from?.first_name || "Trader"}!* 🌴`,
        "",
        "The safest way to buy & sell crypto in Kerala.",
        "",
        "💳 *Your Deposit Wallet:*",
        `\`${user.wallet_address}\``,
        "",
        "🚀 *How it Works:*",
        "🔍 *Browse*: Find the best price in `/ads`.",
        "🤝 *Match*: Start a trade – crypto is safely locked 🔒.",
        "📲 *Pay*: Send money directly to the seller's UPI.",
        "💰 *Receive*: Seller confirms and you get the crypto! ✅",
        "",
        "What would you like to do?",
    ].join("\n");

    const miniAppUrl = "https://registered-adi-highphaus-d016d815.koyeb.app/app";

    const startKeyboard = new InlineKeyboard()
        .webApp("📱 Open Mini App", miniAppUrl)
        .row()
        .text("🛒 Buy Crypto", "newad:buy")
        .text("💰 Sell Crypto", "newad:sell")
        .row()
        .text("❓ How to Trade", "how_to_trade");

    await ctx.reply(welcome, { parse_mode: "Markdown", reply_markup: startKeyboard });

    // If new user, immediately ask for UPI
    if (isNewUser && !user.upi_id) {
        setTimeout(async () => {
            const keyboard = new InlineKeyboard()
                .text("📱 Set UPI Now", "setup_upi")
                .row()
                .text("⏭️ Skip for Now", `cancel_action:${user.id}`);

            await ctx.reply(
                [
                    "📱 *One more step — Set your UPI ID*",
                    "",
                    "You'll need UPI to receive/send fiat payments.",
                    "",
                    "Examples:",
                    "• `yourname@upi`",
                    "• `9876543210@paytm`",
                    "• `yourname@okicici`",
                    "",
                    "Tap below or just type your UPI ID:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            ctx.session.awaiting_input = "upi_id";
        }, 1500); // Small delay so user reads welcome first
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /upi COMMAND
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//              TRADE DM NOTIFICATION HELPER
// ═══════════════════════════════════════════════════════════════

async function notifyTrader(telegramId: number, message: string) {
    try {
        await bot.api.sendMessage(telegramId, message, { parse_mode: "Markdown" });
    } catch (err) {
        console.error(`Failed to notify user ${telegramId}:`, err);
    }
}

// ═══════════════════════════════════════════════════════════════
//                  /payment COMMAND (replaces /upi)
// ═══════════════════════════════════════════════════════════════

bot.command("payment", async (ctx) => {
    const user = await ensureUser(ctx);

    const status = [
        "💳 *Your Payment Methods*",
        "",
        `📱 UPI: ${user.upi_id ? `\`${user.upi_id}\`` : '❌ Not set'}`,
        `📞 Phone: ${user.phone_number ? `\`${user.phone_number}\`` : '❌ Not set'}`,
        `🏦 Bank: ${user.bank_account_number ? `\`${user.bank_account_number}\` (${user.bank_ifsc || ''})` : '❌ Not set'}`,
        "",
        "*Set up:*",
        "• `/upi yourname@upi` — Set UPI",
        "• `/phone 9876543210` — Set phone",
        "• `/bank ACCT_NO IFSC_CODE` — Set bank",
        "",
        "Or use the Mini App for the easiest setup! 📱",
    ].join("\n");

    const miniAppUrl = "https://registered-adi-highphaus-d016d815.koyeb.app/app/profile";
    const keyboard = new InlineKeyboard()
        .webApp("📱 Open Profile", miniAppUrl)
        .row()
        .text("📱 Set UPI", "setup_upi")
        .text("📞 Set Phone", "setup_phone")
        .row()
        .text("🏦 Set Bank", "setup_bank");

    await ctx.reply(status, { parse_mode: "Markdown", reply_markup: keyboard });
});

// /upi alias (kept for backward compat)
bot.command("upi", async (ctx) => {
    const user = await ensureUser(ctx);

    const args = ctx.match?.trim();
    if (args && args.includes("@")) {
        await db.updateUser(user.id, { upi_id: args });
        await ctx.reply(
            [
                "✅ *UPI ID Updated!*",
                "",
                `📱 UPI: \`${args}\``,
                "",
                "You're all set to trade! Try /newad",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        return;
    }

    if (user.upi_id) {
        const keyboard = new InlineKeyboard()
            .text("✏️ Change UPI", "setup_upi")
            .text("✅ Keep Current", `cancel_action:${user.id}`);

        await ctx.reply(
            [
                "📱 *Your UPI ID*",
                "",
                `Current: \`${user.upi_id}\``,
                "",
                "Want to change it?",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        ctx.session.awaiting_input = "upi_id";
        await ctx.reply(
            [
                "📱 *Set Your UPI ID*",
                "",
                "Send your UPI ID to receive/send fiat payments.",
                "",
                "Examples:",
                "• `yourname@upi`",
                "• `9876543210@paytm`",
                "• `yourname@okaxis`",
                "• `yourname@okicici`",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    }
});

// /phone command
bot.command("phone", async (ctx) => {
    const user = await ensureUser(ctx);
    const args = ctx.match?.trim();
    const cleaned = args?.replace(/\D/g, '') || '';

    if (cleaned.length >= 10) {
        await db.updateUser(user.id, { phone_number: cleaned });
        await ctx.reply(`✅ Phone number updated: \`${cleaned}\``, { parse_mode: "Markdown" });
        return;
    }

    ctx.session.awaiting_input = "phone_number";
    await ctx.reply(
        [
            "📞 *Set Your Phone Number*",
            "",
            user.phone_number ? `Current: \`${user.phone_number}\`` : "Not set yet.",
            "",
            "Send your 10-digit mobile number:",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

// /bank command
bot.command("bank", async (ctx) => {
    const user = await ensureUser(ctx);
    const args = ctx.match?.trim();

    if (args) {
        const parts = args.split(/\s+/);
        if (parts.length >= 2) {
            const updates: Record<string, any> = {
                bank_account_number: parts[0],
                bank_ifsc: parts[1].toUpperCase(),
            };
            if (parts[2]) updates.bank_name = parts.slice(2).join(' ');
            await db.updateUser(user.id, updates as any);
            await ctx.reply(
                [
                    "✅ *Bank Details Updated!*",
                    "",
                    `🏦 Account: \`${parts[0]}\``,
                    `IFSC: \`${parts[1].toUpperCase()}\``,
                    parts[2] ? `Bank: ${parts.slice(2).join(' ')}` : "",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        }
    }

    ctx.session.awaiting_input = "bank_details";
    await ctx.reply(
        [
            "🏦 *Set Your Bank Details*",
            "",
            user.bank_account_number
                ? `Current: \`${user.bank_account_number}\` (${user.bank_ifsc || ''})`
                : "Not set yet.",
            "",
            "Send: `ACCOUNT_NUMBER IFSC_CODE BANK_NAME`",
            "Example: `1234567890 SBIN0001234 SBI`",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});


// ═══════════════════════════════════════════════════════════════
//                     /help COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("help", async (ctx) => {
    const help = [
        "📚 *P2P Kerala Bot — Help*",
        "",
        "*How P2P Trading Works:*",
        "1️⃣ Seller lists crypto (e.g., 100 USDC at ₹88)",
        "2️⃣ Buyer matches the order",
        "3️⃣ Seller's crypto → locked in smart contract 🔒",
        "4️⃣ Buyer sends fiat (UPI/Bank) → marks as paid",
        "5️⃣ Seller confirms fiat received → crypto released ✅",
        `6️⃣ Admin fee: ${(env.FEE_PERCENTAGE * 50).toFixed(1)}% auto-deducted`,
        "",
        "*Safety Features:*",
        "🔒 Smart contract escrow (trustless)",
        "⏰ Auto-refund to seller if buyer doesn't pay (1 hr)",
        "📸 Payment proof required",
        "⚖️ Dispute resolution system",
        "⭐ Trust scoring",
        "",
        "*Commands:*",
        "📢 /newad — Create a buy or sell ad",
        "🔍 /ads — Browse live P2P ads",
        "📋 /myads — Manage your ads",
        "/sell — Quick sell order",
        "/buy — Quick buy",
        "/orders — View order book",
        "/mytrades — Your trade history",
        "/portfolio — View all token balances & send",
        "/send — Withdraw crypto to external wallet",
        "/wallet — Wallet settings",
        "/payment — Set up payment methods (UPI/Phone/Bank)",
        "/export — Export private key",
        "/bridge — Bridge tokens",
        "/profile — Your profile",
        "/dispute — Raise a dispute",
        "",
        `*Fee:* ${(env.FEE_PERCENTAGE * 50).toFixed(1)}% per trade (${env.FEE_BPS} bps)`,
        `*Network:* ${env.DEFAULT_CHAIN}`,
        `*Token:* ${env.DEFAULT_TOKEN}`,
        "",
        "💬 Or just type what you want in plain English!",
    ].join("\n");

    await ctx.reply(help, { parse_mode: "Markdown" });
});

// ═══════════════════════════════════════════════════════════════
//                     /newad COMMAND (Create Ad)
// ═══════════════════════════════════════════════════════════════

bot.command("newad", async (ctx) => {
    const user = await ensureUser(ctx);

    if (!user.upi_id && !user.phone_number && !user.bank_account_number) {
        const keyboard = new InlineKeyboard()
            .text("💳 Set Payment Methods", "setup_payment")
            .text("⏭️ Skip", `cancel_action:${user.id}`);
        await ctx.reply(
            [
                "💳 *Set up payment methods first!*",
                "",
                "You need at least one payment method (UPI, Phone, or Bank) to trade.",
                "",
                "Use /payment or tap below:",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    if (!user.wallet_address) {
        await ctx.reply("⚠️ Set up your wallet first! Type /start to create one.");
        return;
    }

    const keyboard = new InlineKeyboard()
        .text("🔴 I want to SELL crypto", "newad:sell")
        .row()
        .text("🟢 I want to BUY crypto", "newad:buy");

    await ctx.reply(
        [
            "📢 *Create a New Ad*",
            "",
            "What do you want to do?",
            "",
            "🔴 *SELL* — You have crypto, want INR",
            "🟢 *BUY* — You have INR, want crypto",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

bot.command("send", async (ctx) => {
    const user = await ensureUser(ctx);

    if (!user.wallet_address) {
        await ctx.reply("⚠️ Set up your wallet first! Type /start to create one.");
        return;
    }

    ctx.session.send_draft = {};

    const keyboard = new InlineKeyboard()
        .text("💵 USDC", "send_token:USDC")
        .text("dt USDT", "send_token:USDT")
        .text("💎 ETH", "send_token:ETH")
        .row()
        .text("❌ Cancel", `cancel_action:${user.id}`);

    await ctx.reply(
        [
            "💸 *Send Crypto*",
            "",
            "Withdraw your funds to any external wallet on Base.",
            "",
            "Select the token to send:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// Also keep /sell as alias
bot.command("sell", async (ctx) => {
    await ensureUser(ctx);

    await ctx.reply(
        [
            "💰 *Create Sell Ad*",
            "",
            "Tell me what you want to sell:",
            "",
            '*Example:* "sell 100 usdc at 88 via upi"',
            "",
            "Or provide details step by step:",
            "• Amount (e.g., 100 USDC)",
            "• Rate in INR (e.g., ₹88/USDC)",
            "• Payment method (UPI, IMPS, NEFT)",
            "",
            "Or use /newad for guided setup.",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );

    ctx.session.awaiting_input = "sell_details";
});

// ═══════════════════════════════════════════════════════════════
//                     /ads COMMAND (Browse Live Ads)
// ═══════════════════════════════════════════════════════════════

bot.command("ads", async (ctx) => {
    await ensureUser(ctx);

    const keyboard = new InlineKeyboard()
        .text("🔴 Sell Ads (Buy crypto)", "ads:sell")
        .text("🟢 Buy Ads (Sell crypto)", "ads:buy")
        .row()
        .text("📊 All Ads", "ads:all")
        .row()
        .text("🔍 Filter by Amount", "ads:filter_amount")
        .text("🔍 Filter by Rate", "ads:filter_rate");

    await ctx.reply(
        [
            "📢 *Live P2P Ads*",
            "",
            "Browse active trading ads from the community.",
            "",
            "🔴 *Sell Ads* — Traders selling crypto (you buy from them)",
            "🟢 *Buy Ads* — Traders buying crypto (you sell to them)",
            "",
            "Select a category below:",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /myads COMMAND (Manage Your Ads)
// ═══════════════════════════════════════════════════════════════

bot.command("myads", async (ctx) => {
    const user = await ensureUser(ctx);

    try {
        const orders = await db.getUserOrders(user.id);
        const activeOrders = orders.filter((o: any) => o.status === "active");
        const pausedOrders = orders.filter((o: any) => o.status === "paused");

        if (orders.length === 0) {
            const keyboard = new InlineKeyboard()
                .text("📢 Create New Ad", "newad_start");

            await ctx.reply(
                [
                    "📋 *My Ads*",
                    "",
                    "You don't have any ads yet!",
                    "Create your first ad to start trading.",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            return;
        }

        const sections: string[] = ["📋 *My Ads*", ""];

        if (activeOrders.length > 0) {
            sections.push(`🟢 *Active Ads (${activeOrders.length})*`);
            sections.push("");
            activeOrders.forEach((o: any, i: number) => {
                const emoji = o.type === "sell" ? "🔴" : "🟢";
                const available = o.amount - (o.filled_amount || 0);
                sections.push([
                    `${i + 1}. ${emoji} *${o.type.toUpperCase()}* ${formatUSDC(available)}`,
                    `   Rate: ${formatINR(o.rate)}/USDC | Total: ${formatINR(available * o.rate)}`,
                    `   Payment: ${o.payment_methods?.join(", ") || "UPI"}`,
                    `   ID: \`${o.id.slice(0, 8)}\``,
                ].join("\n"));
                sections.push("");
            });
        }

        if (pausedOrders.length > 0) {
            sections.push(`⏸️ *Paused Ads (${pausedOrders.length})*`);
            pausedOrders.forEach((o: any, i: number) => {
                sections.push(`  ${i + 1}. ${o.type.toUpperCase()} ${formatUSDC(o.amount)} at ${formatINR(o.rate)}`);
            });
            sections.push("");
        }

        const keyboard = new InlineKeyboard()
            .text("📢 New Ad", "newad_start")
            .text("⏸️ Pause All", "ads:pause_all")
            .row()
            .text("🗑️ Delete All", "ads:delete_all");

        sections.push(
            "━━━━━━━━━━━━━━━━━━━",
            "Actions: Tap ad ID to edit, or use buttons below."
        );

        await ctx.reply(sections.join("\n"), { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (error) {
        await ctx.reply("❌ Failed to load your ads.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /mytrades COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("mytrades", async (ctx) => {
    const user = await ensureUser(ctx);
    try {
        const trades = await db.getUserTrades(user.id);

        if (trades.length === 0) {
            await ctx.reply("📭 You have no active trades.");
            return;
        }

        const keyboard = new InlineKeyboard();

        const statusMap: any = {
            'created': '🆕 Created',
            'in_escrow': '🟡 In Escrow',
            'fiat_sent': '🔵 Paid',
            'completed': '✅ Completed',
            'disputed': '🔴 Disputed',
            'cancelled': '❌ Cancelled'
        };

        trades.forEach((t: any) => {
            const isBuyer = t.buyer_id === user.id;
            const role = isBuyer ? "🟢 Buying" : "🔴 Selling";
            const amt = formatUSDC(t.amount, t.token);
            const status = statusMap[t.status] || t.status;

            const date = formatShortDate(t.created_at);
            keyboard.text(`${role} ${amt} (${status}) | ${date}`, `trade_view:${t.id}`).row();
        });

        await ctx.reply("📋 *Your Trades*\nSelect a trade to view actions:", {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    } catch (e) {
        console.error("MyTrades error:", e);
        await ctx.reply("❌ Failed to fetch trades.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /buy COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("buy", async (ctx) => {
    await ensureUser(ctx);

    // Show available sell orders
    try {
        const orders = await db.getActiveOrders("sell", "USDC", 10);

        if (orders.length === 0) {
            await ctx.reply(
                [
                    "📊 *No sell orders available right now*",
                    "",
                    "Be the first! Create a sell order with /sell",
                    "Or check back later.",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        }

        const orderList = orders.map((o, i) => formatOrder(o, i)).join("\n\n");

        const keyboard = new InlineKeyboard();
        orders.slice(0, 5).forEach((o) => {
            keyboard.text(`Buy ${formatUSDC(o.amount - o.filled_amount)}`, `buy:${o.id}`).row();
        });

        await ctx.reply(
            [
                "📊 *Available Sell Orders*",
                "",
                orderList,
                "",
                "━━━━━━━━━━━━━━━━━━━",
                "Tap a button below or type the order ID to buy.",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } catch (error) {
        await ctx.reply("❌ Failed to load orders. Database may not be configured yet.\n\nRun /help for setup instructions.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /orders COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("orders", async (ctx) => {
    try {
        const [sellOrders, buyOrders] = await Promise.all([
            db.getActiveOrders("sell", undefined, 5),
            db.getActiveOrders("buy", undefined, 5),
        ]);

        const sections: string[] = ["📊 *Order Book*", ""];
        const keyboard = new InlineKeyboard();

        if (sellOrders.length > 0) {
            sections.push("🔴 *SELL ORDERS* (Buy these)");
            sections.push("");
            sellOrders.forEach((o, i) => {
                sections.push(formatOrder(o, i));
                const available = o.amount - (o.filled_amount || 0);
                keyboard.text(`🟢 Buy ${formatUSDC(available, o.token)} @ ${formatINR(o.rate)}`, `trade_ad:${o.id}`).row();
            });
        } else {
            sections.push("🔴 *SELL ORDERS* — None available");
        }

        sections.push("");

        if (buyOrders.length > 0) {
            sections.push("🟢 *BUY ORDERS* (Sell to these)");
            sections.push("");
            buyOrders.forEach((o, i) => {
                sections.push(formatOrder(o, i));
                const available = o.amount - (o.filled_amount || 0);
                keyboard.text(`🔴 Sell ${formatUSDC(available, o.token)} @ ${formatINR(o.rate)}`, `trade_ad:${o.id}`).row();
            });
        } else {
            sections.push("🟢 *BUY ORDERS* — None available");
        }

        sections.push(
            "",
            "━━━━━━━━━━━━━━━━━━━",
            "Select an order above to start a trade.",
            "Or use /newad to list your own."
        );

        await ctx.reply(sections.join("\n"), { parse_mode: "Markdown", reply_markup: keyboard });
    } catch (error) {
        await ctx.reply("❌ Failed to load orders. Database may not be configured yet.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /balance COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command(["balance", "portfolio"], async (ctx) => {
    const user = await ensureUser(ctx);

    if (!user.wallet_address) {
        await ctx.reply(
            [
                "💰 *Wallet Balance*",
                "",
                "⚠️ No wallet connected yet!",
                "",
                "Use /wallet to set up your wallet address.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        return;
    }

    try {
        const balances = await wallet.getBalances(user.wallet_address);
        const keyboard = new InlineKeyboard()
            .text("💸 Send USDC", "send_token:USDC")
            .text("💸 Send USDT", "send_token:USDT")
            .row()
            .text("💸 Send ETH", "send_token:ETH")
            .row()
            .text("✨ Create Ad", "newad_start");

        await ctx.reply(
            [
                "💰 *Your Portfolio*",
                "",
                `Address: \`${truncateAddress(user.wallet_address)}\``,
                "",
                `💵 *USDC*: ${balances.usdc}`,
                `💵 *USDT*: ${balances.usdt}`,
                `💎 *ETH*: ${balances.eth}`,
                "",
                "━━━━━━━━━━━━━━━━━━━",
                "Select a token to withdraw or create a trade:",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } catch (error) {
        await ctx.reply(
            [
                "💰 *Your Wallet*",
                "",
                `Address: \`${truncateAddress(user.wallet_address)}\``,
                "⚠️ Could not fetch balance. RPC may be unavailable.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /wallet COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("wallet", async (ctx) => {
    const user = await ensureUser(ctx);

    if (user.wallet_address) {
        const keyboard = new InlineKeyboard()
            .text("📋 Copy Address", `copy:${user.wallet_address}`)
            .row()
            .text("🔑 Export Private Key", "export_key")
            .row()
            .text("📱 Set UPI", "change_upi");

        await ctx.reply(
            [
                "🔑 *Your Wallet*",
                "",
                `💳 Address: \`${user.wallet_address}\``,
                `📱 UPI: ${user.upi_id || "Not set"}`,
                "",
                "Your wallet was created automatically.",
                "You OWN this wallet — export your key anytime!",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } else {
        await ctx.reply(
            [
                "🔑 *Wallet Setup*",
                "",
                "Send me your Base wallet address:",
                "",
                "Example: `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18`",
                "",
                "This is where you'll receive USDC from trades.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        ctx.session.awaiting_input = "wallet_address";
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /export COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("export", async (ctx) => {
    // Only allow in private chats (NEVER expose keys in groups)
    if (ctx.chat.type !== "private") {
        await ctx.reply("⚠️ For security, key export is only available in DM. Message me directly!");
        return;
    }

    const user = await ensureUser(ctx);

    if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
        await ctx.reply("❌ No wallet found. Type /start to create one.");
        return;
    }

    const keyboard = new InlineKeyboard()
        .text("⚠️ Yes, show my private key", "confirm_export")
        .row()
        .text("❌ Cancel", "cancel_action");

    await ctx.reply(
        [
            "🔒 *Export Private Key*",
            "",
            "⚠️ *WARNING:*",
            "• Anyone with your private key can STEAL your funds",
            "• NEVER share it with anyone",
            "• NEVER paste it on any website",
            "• Screenshot it and keep it OFFLINE",
            "",
            "Are you sure you want to see your private key?",
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: keyboard }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /profile COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("profile", async (ctx) => {
    const user = await ensureUser(ctx);

    const stars = user.trust_score >= 95 ? "💎" :
        user.trust_score >= 80 ? "⭐" :
            user.trust_score >= 60 ? "🟢" :
                user.trust_score >= 30 ? "🟡" : "🔴";

    await ctx.reply(
        [
            "👤 *Your Profile*",
            "",
            `Name: ${user.first_name || "Anonymous"}`,
            `Username: @${user.username || "not set"}`,
            `Tier: ${user.tier.toUpperCase()}`,
            "",
            "━━━━━━━━━━━━━━━━",
            `${stars} Trust: ${user.trust_score}%`,
            `📈 Total Trades: ${user.trade_count}`,
            `✅ Completed: ${user.completed_trades}`,
            `📊 Success Rate: ${user.trade_count > 0 ? ((user.completed_trades / user.trade_count) * 100).toFixed(0) : 0}%`,
            "",
            `💳 Wallet: ${user.wallet_address ? `\`${truncateAddress(user.wallet_address)}\`` : "Not set"}`,
            `📱 UPI: ${user.upi_id || "Not set"}`,
            `🔐 Verified: ${user.is_verified ? "Yes ✅" : "No"}`,
            "",
            `Member since: ${new Date(user.created_at).toLocaleDateString()}`,
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /admin COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) return;

    try {
        const [stats, relayerUsdc, relayerEth, contractFees] = await Promise.all([
            db.getStats(),
            wallet.getTokenBalance(env.ADMIN_WALLET_ADDRESS, env.USDC_ADDRESS, 'base'),
            wallet.getBalances(env.ADMIN_WALLET_ADDRESS).then(b => b.eth),
            wallet.getTokenBalance(env.ESCROW_CONTRACT_ADDRESS, env.USDC_ADDRESS, 'base')
        ]);

        const keyboard = new InlineKeyboard()
            .text("⚖️ View Active Disputes", "admin_disputes_list").row()
            .text("🔄 Refresh Stats", "admin_stats_refresh");

        await ctx.reply(
            [
                "⚙️ *Admin Dashboard*",
                "",
                "📈 *System Stats*",
                `Users: ${stats.total_users}`,
                `Ads: ${stats.active_orders} active`,
                `Trades: ${stats.total_trades} (${stats.completed_trades} ok)`,
                `Volume: ${formatUSDC(stats.total_volume_usdc)}`,
                "",
                "💰 *Relayer Wallet*",
                `Address: \`${truncateAddress(env.ADMIN_WALLET_ADDRESS)}\``,
                `Balance: *${relayerUsdc} USDC*`,
                `Gas: *${relayerEth} ETH*`,
                "",
                "🏧 *Escrow Contract*",
                `Collected Fees: *${contractFees} USDC*`,
                "",
                "━━━━━━━━━━━━━━━━",
                "Fees are sent to your wallet automatically upon release."
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
    } catch (e) {
        console.error("Admin error:", e);
        await ctx.reply("❌ Failed to load admin stats.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /bridge COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("bridge", async (ctx) => {
    await ensureUser(ctx);

    await ctx.reply(
        [
            "🌉 *Bridge Tokens*",
            "",
            "Move tokens across chains! Powered by LI.FI aggregator.",
            "",
            "Supported chains: Base, Ethereum, Arbitrum, Polygon, Optimism",
            "",
            "Tell me what to bridge:",
            '  "bridge 50 usdc from base to ethereum"',
            '  "bridge 0.1 eth to arbitrum"',
            "",
            "I'll find the best route with lowest fees! 🔍",
        ].join("\n"),
        { parse_mode: "Markdown" }
    );
});

// ═══════════════════════════════════════════════════════════════
//                     /admin COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Admin access only.");
        return;
    }

    try {
        const stats = await db.getStats();

        await ctx.reply(
            [
                "🛡️ *Admin Dashboard*",
                "",
                "━━━━ *Platform Stats* ━━━━",
                `👥 Total Users: ${stats.total_users}`,
                `📊 Total Trades: ${stats.total_trades}`,
                `✅ Completed: ${stats.completed_trades}`,
                `📋 Active Orders: ${stats.active_orders}`,
                `💰 Volume: ${formatUSDC(stats.total_volume_usdc)}`,
                `💸 Fees Collected: ${formatUSDC(stats.total_fees_collected)}`,
                `⚠️ Active Disputes: ${stats.active_disputes}`,
                "",
                "━━━━ *Actions* ━━━━",
                "/disputes — View open disputes",
                "/stats — Refresh stats",
                "/broadcast — Send message to all",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
    } catch (error) {
        await ctx.reply("❌ Failed to load stats. Database may not be configured.");
    }
});

// ═══════════════════════════════════════════════════════════════
//                     /disputes COMMAND
// ═══════════════════════════════════════════════════════════════

bot.command("disputes", async (ctx) => {
    if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Admin access only.");
        return;
    }

    try {
        const disputes = await db.getDisputedTrades();

        if (disputes.length === 0) {
            await ctx.reply("✅ No active disputes! 🎉");
            return;
        }

        for (const trade of disputes) {
            const keyboard = new InlineKeyboard()
                .text("✅ Release to Buyer", `resolve:${trade.id}:buyer`)
                .row()
                .text("🔄 Refund to Seller", `resolve:${trade.id}:seller`);

            await ctx.reply(
                [
                    `⚠️ *Dispute — Trade ${trade.id.slice(0, 8)}*`,
                    "",
                    `Amount: ${formatUSDC(trade.amount)}`,
                    `Fiat: ${formatINR(trade.fiat_amount)}`,
                    `Status: ${formatTradeStatus(trade.status)}`,
                    `Reason: ${trade.dispute_reason || "Not specified"}`,
                    "",
                    `Created: ${new Date(trade.created_at).toLocaleString()}`,
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
        }
    } catch (error) {
        await ctx.reply("❌ Failed to load disputes.");
    }
});

// ═══════════════════════════════════════════════════════════════
//              CALLBACK QUERY HANDLERS
// ═══════════════════════════════════════════════════════════════

bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    console.log(`[CALLBACK] Received: ${data} from user ${ctx.from.id} (@${ctx.from.username || "anon"})`);

    // Ensure all callbacks are answered eventually (default fallback if not handled)
    let handled = false;

    // Monitor all callbacks
    console.log(`[CQ] Data: ${data}`);

    // Wrap the entire handler in a try/catch to prevent global crashes
    try {

        // Handle "I want to SELL/BUY" from /newad
        // Handle "I want to SELL/BUY" from /newad
        if (data === "newad:sell" || data === "newad:buy") {
            const adType = data.replace("newad:", "");
            ctx.session.ad_draft = { type: adType };

            const keyboard = new InlineKeyboard()
                .text("💵 USDC (Base)", `newad_token:USDC`)
                .text("dt USDT (Base)", `newad_token:USDT`);

            await ctx.editMessageText(
                [
                    `📢 *Create ${adType.toUpperCase()} Ad — Step 1/3*`,
                    "",
                    "Which token do you want to trade?",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle "How to Trade" guide
        if (data === "how_to_trade") {
            const guide = [
                "👋 *Is it safe? YES!*",
                "",
                "Think of the bot as a *digital locker*. 🔐",
                "",
                "1️⃣ *Lock*: When a trade starts, the crypto is moved into the locker.",
                "2️⃣ *Secure*: The locker stays shut while the buyer sends the money.",
                "3️⃣ *Release*: Once the seller says \"I got the money\", the locker opens for the buyer! 🔓",
                "",
                "_No one can steal, and no one can run away._",
                "",
                "Want to try? Tap a button below!",
            ].join("\n");

            const keyboard = new InlineKeyboard()
                .text("🛒 Buy Crypto", "newad:buy")
                .text("💰 Sell Crypto", "newad:sell")
                .row()
                .text("🔙 Back", "start_over");

            await ctx.editMessageText(guide, { parse_mode: "Markdown", reply_markup: keyboard });
            await ctx.answerCallbackQuery();
        }

        // Handle "Back" to Start
        if (data === "start_over") {
            const user = await ensureUser(ctx);
            const welcome = [
                `👋 *Welcome to P2P Kerala, ${ctx.from?.first_name || "Trader"}!* 🌴`,
                "",
                "The safest way to buy & sell crypto in Kerala.",
                "",
                "💳 *Your Deposit Wallet:*",
                `\`${user.wallet_address}\``,
                "",
                "🚀 *How it Works:*",
                "🔍 *Browse*: Find the best price in `/ads`.",
                "🤝 *Match*: Start a trade – crypto is safely locked 🔒.",
                "📲 *Pay*: Send money directly to the seller's UPI.",
                "💰 *Receive*: Seller confirms and you get the crypto! ✅",
                "",
                "What would you like to do?",
            ].join("\n");

            const miniAppUrl = "https://registered-adi-highphaus-d016d815.koyeb.app/app";
            const startKeyboard = new InlineKeyboard()
                .webApp("📱 Open Mini App", miniAppUrl)
                .row()
                .text("🛒 Buy Crypto", "newad:buy")
                .text("💰 Sell Crypto", "newad:sell")
                .row()
                .text("❓ How to Trade", "how_to_trade");

            await ctx.editMessageText(welcome, { parse_mode: "Markdown", reply_markup: startKeyboard });
            await ctx.answerCallbackQuery();
        }

        // Handle Token Selection -> Ask Amount
        if (data.startsWith("newad_token:")) {
            const token = data.replace("newad_token:", "");
            const draft = ctx.session.ad_draft;

            if (!draft || !draft.type) {
                await ctx.answerCallbackQuery({ text: "Session expired. Start over." });
                return;
            }

            draft.token = token;
            ctx.session.awaiting_input = `ad_amount_${draft.type}`;

            const minAmount = 1;

            await ctx.editMessageText(
                [
                    `📢 *Create ${draft.type.toUpperCase()} Ad — Step 2/3*`,
                    "",
                    `Selected: *${token}* ✅`,
                    "",
                    `How much ${token} do you want to ${draft.type}?`,
                    "",
                    `Minimum: *${minAmount} ${token}*`,
                    "",
                    "Send the amount (e.g., `100` or `50.5`):",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
            handled = true;
        }

        // Handle AI-generated Sell Order confirmation
        if (data.startsWith("confirm_sell:")) {
            console.log("DEBUG: confirm_sell callback received:", data);
            await ctx.answerCallbackQuery({ text: "Processing Sell Confirmation..." });
            handled = true;
            try {
                const parts = data.split(":");
                if (parts.length < 4) throw new Error("Invalid callback data format (missing user_id)");

                const amountStr = parts[1];
                const rateStr = parts[2];
                const creatorId = parseInt(parts[3]);

                if (ctx.from.id !== creatorId) {
                    await ctx.answerCallbackQuery({ text: "⚠️ Expected creator to confirm.", show_alert: true });
                    return;
                }

                const amount = parseFloat(amountStr);
                const rate = parseFloat(rateStr);

                if (isNaN(amount) || isNaN(rate)) {
                    throw new Error(`Invalid amount or rate: ${amountStr}, ${rateStr}`);
                }

                ctx.session.ad_draft = {
                    type: "sell",
                    amount: amount,
                    rate: rate,
                    token: "USDC"
                };

                const keyboard = new InlineKeyboard()
                    .text("⚡ UPI", `ad_pay:upi:${creatorId}`)
                    .text("🏦 Bank Transfer", `ad_pay:bank:${creatorId}`)
                    .text("💳 All Methods", `ad_pay:all:${creatorId}`);

                const text = [
                    "📢 *Create Sell Ad — Step 3/3*",
                    "",
                    `Amount: *${formatUSDC(amount)}*`,
                    `Rate: *${formatINR(rate)}/USDC*`,
                    "",
                    "How do you want to receive payment?",
                ].join("\n");

                console.log("DEBUG: Editing message to Step 3/3");
                await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
                await ctx.answerCallbackQuery();
                handled = true;
            } catch (err: any) {
                console.error("DEBUG: Error in create_sell handler:", err);
                await ctx.answerCallbackQuery({ text: "❌ Error: " + err.message, show_alert: true });
            }
        }

        // Handle AI-generated Buy Order confirmation
        if (data.startsWith("confirm_buy:")) {
            console.log("DEBUG: confirm_buy callback received:", data);
            await ctx.answerCallbackQuery({ text: "Processing Buy Confirmation..." });
            handled = true;
            try {
                const parts = data.split(":");
                // confirm_buy:AMOUNT:RATE:USERID
                if (parts.length < 4) throw new Error("Invalid callback data format (missing user_id)");

                const amountStr = parts[1];
                const rateStr = parts[2];
                const creatorId = parseInt(parts[3]);

                if (ctx.from.id !== creatorId) {
                    await ctx.answerCallbackQuery({ text: "⚠️ Expected creator to confirm.", show_alert: true });
                    return;
                }

                const amount = parseFloat(amountStr);
                const rate = parseFloat(rateStr);

                if (isNaN(amount) || isNaN(rate)) {
                    throw new Error(`Invalid amount or rate: ${amountStr}, ${rateStr}`);
                }

                ctx.session.ad_draft = {
                    type: "buy",
                    amount: amount,
                    rate: rate,
                    token: "USDC"
                };

                const keyboard = new InlineKeyboard()
                    .text("⚡ UPI", "ad_pay:upi")
                    .text("🏦 Bank Transfer", "ad_pay:bank")
                    .text("💳 All Methods", "ad_pay:all");

                const text = [
                    "📢 *Create Buy Ad — Step 3/3*",
                    "",
                    `Amount: *${formatUSDC(amount)}*`,
                    `Rate: *${formatINR(rate)}/USDC*`,
                    "",
                    "How do you want to pay the seller?",
                ].join("\n");

                console.log("DEBUG: Editing message to Step 3/3");
                await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: keyboard });
                await ctx.answerCallbackQuery();
                handled = true;
            } catch (err: any) {
                console.error("DEBUG: Error in confirm_buy handler:", err);
                await ctx.answerCallbackQuery({ text: "❌ Error: " + err.message, show_alert: true });
            }
        }

        // Handle Send Token Selection -> Ask Address
        if (data.startsWith("send_token:")) {
            const token = data.replace("send_token:", "");
            const tokenAddress = token === "ETH" ? "native" : (token === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS);

            ctx.session.send_draft = { token, token_address: tokenAddress };
            ctx.session.awaiting_input = "send_to_address";

            await ctx.editMessageText(
                [
                    "💸 *Send Crypto — Step 1/3*",
                    "",
                    `Token: *${token}*`,
                    "",
                    "Please send the *destination wallet address* (Base network):",
                    "",
                    "_Example: 0x123..._",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle "Create New Ad" button
        if (data === "newad_start") {
            const keyboard = new InlineKeyboard()
                .text("🔴 I want to SELL crypto", "newad:sell")
                .row()
                .text("🟢 I want to BUY crypto", "newad:buy");

            await ctx.editMessageText(
                [
                    "📢 *Create a New Ad*",
                    "",
                    "What do you want to do?",
                    "",
                    "🔴 *SELL* — You have crypto, want INR",
                    "🟢 *BUY* — You have INR, want crypto",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // ─────── AD BROWSING HANDLERS ───────

        // Browse sell/buy/all ads
        if (data === "ads:sell" || data === "ads:buy" || data === "ads:all") {
            const filterType = data === "ads:all" ? undefined : data.replace("ads:", "");
            const label = data === "ads:sell" ? "Sell" : data === "ads:buy" ? "Buy" : "All";

            try {
                // Fetch all tokens by default in category view
                const orders = await db.getActiveOrders(filterType, undefined, 10);

                if (orders.length === 0) {
                    await ctx.editMessageText(
                        [
                            `📢 *${label} Ads*`,
                            "",
                            "No ads available right now! 😔",
                            "",
                            "Be the first — /newad to create one!",
                        ].join("\n"),
                        { parse_mode: "Markdown" }
                    );
                    await ctx.answerCallbackQuery();
                    return;
                }

                const adList = orders.map((o, i) => {
                    const emoji = o.type === "sell" ? "🔴 SELL" : "🟢 BUY";
                    const totalAvailable = o.amount - (o.filled_amount || 0);
                    const sellable = totalAvailable * 0.995;
                    const stars = (o.trust_score ?? 0) >= 90 ? "💎" :
                        (o.trust_score ?? 0) >= 70 ? "⭐" : "🟢";

                    return [
                        `${i + 1}. ${emoji} *${formatUSDC(sellable, o.token)}*`,
                        `   💰 Rate: ${formatINR(o.rate)}/${o.token}`,
                        `   💵 Total: ${formatINR(sellable * o.rate)}`,
                        `   💳 ${o.payment_methods?.join(", ") || "UPI"}`,
                        `   👤 @${o.username || "anon"} ${stars}`,
                        `   🆔 \`${o.id.slice(0, 8)}\``,
                    ].join("\n");
                }).join("\n\n");

                // Create inline buttons for top 5 ads
                const keyboard = new InlineKeyboard();
                orders.slice(0, 5).forEach((o) => {
                    const totalAvailable = o.amount - (o.filled_amount || 0);
                    const sellable = totalAvailable * 0.995;
                    const action = o.type === "sell" ? "Buy" : "Sell";
                    keyboard.text(
                        `${action} ${formatUSDC(sellable, o.token)} @ ${formatINR(o.rate)}`,
                        `trade_ad:${o.id}`
                    ).row();
                });
                keyboard.text("🔄 Refresh", data).text("⬅️ Back", "ads_back");

                await ctx.editMessageText(
                    [
                        `📢 *Live ${label} Ads*`,
                        `   _${orders.length} ads available_`,
                        "",
                        adList,
                        "",
                        "━━━━━━━━━━━━━━━━━━━",
                        "Tap an ad below to start a trade:",
                    ].join("\n"),
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
            } catch (error) {
                await ctx.editMessageText("❌ Failed to load ads. Database may not be configured.");
            }
            await ctx.answerCallbackQuery();
        }

        // Back to ad categories
        if (data === "ads_back") {
            const keyboard = new InlineKeyboard()
                .text("🔴 Sell Ads", "ads:sell")
                .text("🟢 Buy Ads", "ads:buy")
                .row()
                .text("📊 All Ads", "ads:all");

            await ctx.editMessageText(
                [
                    "📢 *Live P2P Ads*",
                    "",
                    "Select a category:",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle clicking on a specific ad to initiate trade
        if (data.startsWith("trade_ad:")) {
            const orderId = data.replace("trade_ad:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "This ad is no longer available!" });
                return;
            }

            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "This is your own ad!" });
                return;
            }

            const totalAvailable = order.amount - (order.filled_amount || 0);
            const sellable = totalAvailable * 0.995;
            const buyerFee = totalAvailable * 0.005;
            const buyerReceives = totalAvailable * 0.99;
            const action = order.type === "sell" ? "BUY from" : "SELL to";

            const keyboard = new InlineKeyboard()
                .text("✅ Start Trade", `confirm_trade:${orderId}`)
                .text("❌ Cancel", `cancel_action:${user.id}`);

            await ctx.editMessageText(
                [
                    `🤝 *${action} this trader?*`,
                    "",
                    `Amount: *${formatUSDC(sellable, order.token)}*`,
                    `Rate: *${formatINR(order.rate)}/${order.token}*`,
                    `Total Fiat: *${formatINR(sellable * order.rate)}*`,
                    "",
                    `⚖️ *Symmetry Fee Split (1%)*:`,
                    `• Your Fee (${(env.FEE_PERCENTAGE * 50).toFixed(1)}%): ${formatUSDC(buyerFee, order.token)}`,
                    `• You Receive: *${formatUSDC(buyerReceives, order.token)}*`,
                    "",
                    `Payment: ${order.payment_methods?.join(", ") || "UPI"}`,
                    `Trader: ${order.username ? "@" + order.username.replace(/_/g, "\\_") : "anon"} (⭐ ${order.trust_score ?? 0}%)`,
                    (order as any).upi_id ? `📱 UPI: ${(order as any).upi_id}` : "",
                    "",
                    order.type === "sell"
                        ? "⚠️ Seller deposits USDC to escrow → You send fiat → Crypto released to you"
                        : "⚠️ You deposit USDC to escrow → Buyer sends fiat → You confirm → Crypto released",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // ─────── AI INTENT CALLBACKS (Missing Handlers) ───────



        // ─────── AD PAYMENT METHOD SELECTION (Final Step) ───────

        if (data.startsWith("ad_pay:")) {
            const parts = data.split(":");
            // Format: ad_pay:METHOD[:USERID]
            const method = parts[1];

            // Validate User if ID is present
            if (parts.length >= 3) {
                const creatorId = parseInt(parts[2]);
                if (!isNaN(creatorId) && ctx.from.id !== creatorId) {
                    await ctx.answerCallbackQuery({ text: "⚠️ This is not your ad draft.", show_alert: true });
                    return;
                }
            }

            const user = await ensureUser(ctx);
            const draft = ctx.session.ad_draft;

            if (!draft || !draft.amount || !draft.rate || !draft.type) {
                await ctx.answerCallbackQuery({ text: "Session expired. Start over with /newad" });
                return;
            }

            let paymentMethods: string[] = [];
            if (method === "all") {
                paymentMethods = ["UPI", "IMPS", "NEFT", "PAYTM", "BANK"];
            } else {
                paymentMethods = [method.toUpperCase()];
            }

            try {
                // ═══ FOR SELL ADS: Check balance & lock USDC in escrow ═══
                if (draft.type === "sell") {
                    const tokenSymbol = draft.token || "USDC";
                    const tokenAddress = (tokenSymbol === "USDT") ? env.USDT_ADDRESS : env.USDC_ADDRESS;
                    const amount = draft.amount!;

                    await ctx.editMessageText(`⏳ Checking your Vault balance for ${tokenSymbol}...`);

                    // Use Vault balance instead of wallet balance
                    const vaultBalance = await escrow.getVaultBalance(user.wallet_address!, tokenAddress);
                    const balanceNum = parseFloat(vaultBalance);

                    let fundingSource = "vault"; // 'vault' or 'hot_wallet'

                    // 1. External Wallets: MUST have funds in Vault
                    // (We cannot auto-deposit from external wallets without a signature at trade time)
                    if (user.wallet_type === 'external') {
                        if (balanceNum < amount) {
                            await ctx.reply(
                                [
                                    `❌ *Insufficient Vault Balance*`,
                                    "",
                                    `Since you are using an External Wallet, you must deposit funds to the Vault *before* creating a Sell Ad.`,
                                    "",
                                    `Required: *${formatUSDC(amount, tokenSymbol)}*`,
                                    `Vault Balance: *${formatUSDC(balanceNum, tokenSymbol)}*`,
                                    "",
                                    `📥 *Please deposit funds via the Mini App.*`,
                                ].join("\n"),
                                { parse_mode: "Markdown" }
                            );
                            ctx.session.ad_draft = undefined;
                            await ctx.answerCallbackQuery();
                            return;
                        }
                        fundingSource = "vault";
                    }
                    // 2. Bot Wallets: Can use Hot Wallet (Auto-Deposit)
                    else {
                        // Check Hot Wallet Balance as fallback
                        const hotWalletBalance = await wallet.getTokenBalance(user.wallet_address!, tokenAddress);
                        const hotBalanceNum = parseFloat(hotWalletBalance);

                        if (balanceNum >= amount) {
                            fundingSource = "vault";
                        } else if (hotBalanceNum >= amount) {
                            fundingSource = "hot_wallet";
                        } else {
                            // Neither has enough
                            await ctx.reply(
                                [
                                    `❌ *Insufficient Balance*`,
                                    "",
                                    `You want to sell: *${formatUSDC(amount, tokenSymbol)}*`,
                                    `Vault Balance: *${formatUSDC(balanceNum, tokenSymbol)}*`,
                                    `Hot Wallet: *${formatUSDC(hotBalanceNum, tokenSymbol)}*`,
                                    "",
                                    `📥 *Please deposit funds to your wallet.*`,
                                ].join("\n"),
                                { parse_mode: "Markdown" }
                            );
                            ctx.session.ad_draft = undefined;
                            await ctx.answerCallbackQuery();
                            return;
                        }
                    }

                    // No need to manually "lock" now - it stays in Vault or Hot Wallet until matched
                    const escrowTxHash = fundingSource === "vault" ? "vault_backed" : "hot_wallet_backed";

                    const token = draft.token! || "USDC";

                    const order = await db.createOrder({
                        user_id: user.id,
                        type: "sell",
                        token: token,
                        chain: "base",
                        amount: amount,

                        rate: draft.rate,
                        fiat_currency: "INR",
                        payment_methods: paymentMethods as any,
                        payment_details: {
                            upi: user.upi_id || "",
                            escrow_tx: escrowTxHash,
                            group_id: draft.target_group_id // Save target group ID
                        },
                        status: "active",
                        filled_amount: 0,
                    });

                    const totalFiat = amount * draft.rate;
                    const feeAmount = amount * env.FEE_PERCENTAGE;

                    // Vault-backed ads don't have a specific lock tx yet (it happened during deposit)
                    const explorerUrl = "https://basescan.org/address/" + env.ESCROW_CONTRACT_ADDRESS;

                    // Clear draft
                    ctx.session.ad_draft = undefined;
                    ctx.session.awaiting_input = undefined;

                    // Broadcast Logic (Group Specific)
                    const botUser = await ctx.api.getMe();
                    // Explicitly cast to prevent lint errors
                    const groupVal = (order.payment_details as any)?.group_id;
                    const targetGroup = typeof groupVal === 'number' ? groupVal : undefined;

                    if (targetGroup !== undefined) {
                        // Post ONLY to that group
                        const groupKeyboard = new InlineKeyboard()
                            .url("⚡ Buy Now", `https://t.me/${botUser.username}?start=buy_${order.id}`);

                        await ctx.api.sendMessage(
                            String(targetGroup),
                            `📢 *New Sell Ad!* 🚀\n\n💰 Sell: *${formatUSDC(order.amount)}*\n📈 Rate: *${formatINR(order.rate)}/USDC*\n👤 Seller: @${user.username || "Anonymous"}\n\n👇 *Click below to buy:*`,
                            { parse_mode: "Markdown", reply_markup: groupKeyboard }
                        ).catch(e => console.error(`Group Broadcast failed to ${targetGroup}:`, e));

                    } else if (env.BROADCAST_CHANNEL_ID) {
                        // Fallback: Post to Main Channel for Direct DM ads
                        const channelKeyboard = new InlineKeyboard()
                            .url("⚡ Buy Now", `https://t.me/${botUser.username}?start=buy_${order.id}`);

                        await ctx.api.sendMessage(
                            env.BROADCAST_CHANNEL_ID,
                            `📢 *New Sell Ad!* 🚀\n\n💰 Sell: *${formatUSDC(order.amount)}*\n📈 Rate: *${formatINR(order.rate)}/USDC*\n👤 Seller: @${user.username || "Anonymous"}\n\n👇 *Click below to buy:*`,
                            { parse_mode: "Markdown", reply_markup: channelKeyboard }
                        ).catch(e => console.error("Main Channel Broadcast failed:", e));
                    }

                    const keyboard = new InlineKeyboard()
                        .text("📢 View My Ads", "myads_view")
                        .text("📢 Create Another", "newad_start")
                        .row()
                        .text("🗑️ Delete Ad", `ad_delete:${order.id}`);

                    await ctx.reply(
                        [
                            "✅ *Sell Ad Created!*",
                            "",
                            "🔴 *SELL Ad*",
                            "",
                            `💰 Amount: *${formatUSDC(draft.amount)}*`,
                            `📈 Rate: *${formatINR(draft.rate)}/USDC*`,
                            `💵 Total: *${formatINR(totalFiat)}*`,
                            `💳 Payment: ${paymentMethods.join(", ")}`,
                            `🏷️ Fee: ${formatUSDC(feeAmount)} (${(env.FEE_PERCENTAGE * 50).toFixed(1)}%)`,
                            "",
                            `🔒 *Vault Backed* ✅`,
                            `🔗 [View Vault Balance](${explorerUrl})`,
                            "",
                            `🆔 Ad ID: \`${order.id.slice(0, 8)}\``,
                            "",
                            "━━━━━━━━━━━━━━━━━━━",
                            "Your ad is now LIVE! Buyers can see it.",
                            "You can withdraw your funds from the Vault anytime via /wallet.",
                        ].join("\n"),
                        { parse_mode: "Markdown", reply_markup: keyboard }
                    );

                } else {
                    // ═══ FOR BUY ADS: No escrow needed (buyer wants to buy crypto) ═══
                    const amount = draft.amount!;
                    const token = draft.token! || "USDC";

                    const order = await db.createOrder({
                        user_id: user.id,
                        type: "buy",
                        token: token,
                        chain: "base",
                        amount: amount,
                        rate: draft.rate,
                        fiat_currency: "INR",
                        payment_methods: paymentMethods as any,
                        payment_details: { upi: user.upi_id || "" },
                        status: "active",
                        filled_amount: 0,
                    });

                    const totalFiat = amount * draft.rate;

                    ctx.session.ad_draft = undefined;
                    ctx.session.awaiting_input = undefined;

                    const keyboard = new InlineKeyboard()
                        .text("📢 View My Ads", "myads_view")
                        .text("📢 Create Another", "newad_start")
                        .row()
                        .text("🗑️ Delete Ad", `ad_delete:${order.id}`);

                    await ctx.reply(
                        [
                            `✅ *Buy Ad Created!*`,
                            "",
                            `🟢 *BUY Ad*`,
                            "",
                            `💰 Want to buy: *${formatUSDC(amount, token)}*`,
                            `📈 Rate: *${formatINR(draft.rate)}/${token}*`,
                            `💵 Will pay: *${formatINR(totalFiat)}*`,
                            `💳 Payment: ${paymentMethods.join(", ")}`,
                            "",
                            `🆔 Ad ID: \`${order.id.slice(0, 8)}\``,
                            "",
                            "━━━━━━━━━━━━━━━━━━━",
                            "Your ad is LIVE! Sellers can respond.",
                            `When a seller matches, they'll lock ${token} in escrow first.`,
                        ].join("\n"),
                        { parse_mode: "Markdown", reply_markup: keyboard }
                    );
                }
            } catch (error: any) {
                console.error("Ad creation error:", error);
                const errMsg = error?.message?.includes("insufficient")
                    ? "❌ Insufficient USDC balance. Deposit more and try again."
                    : "❌ Failed to create ad. Please try again with /newad";
                await ctx.reply(errMsg);
            }
            await ctx.answerCallbackQuery();
        }

        // Confirm Send Transaction
        if (data === "confirm_send") {
            const draft = ctx.session.send_draft;
            const user = await ensureUser(ctx);

            if (!draft || !draft.to_address || !draft.amount || !draft.token) {
                await ctx.answerCallbackQuery({ text: "Session expired. Start over." });
                return;
            }

            await ctx.editMessageText("⏳ Sending tokens on blockchain...");

            try {
                const txHash = draft.token === "ETH"
                    ? await wallet.sendNative(user.wallet_index, draft.to_address, draft.amount.toString()) // Ensure string
                    : await wallet.sendToken(
                        user.wallet_index,
                        draft.to_address || "",
                        draft.amount.toString(),
                        draft.token_address || ""
                    );

                ctx.session.send_draft = undefined;

                await ctx.editMessageText(
                    [
                        "✅ *Tokens Sent!* 🚀",
                        "",
                        `Amount: *${draft.amount} ${draft.token}*`,
                        `To: \`${draft.to_address}\``,
                        "",
                        `🔗 [View on BaseScan](${getExplorerUrl(txHash)})`,
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );
            } catch (error) {
                console.error("Send error:", error);
                await ctx.editMessageText("❌ Translation failed on blockchain. Please try again.");
            }
            await ctx.answerCallbackQuery();
        }


        // Unified Cancel/Delete Handler (Handles refunds for Sell ads)
        if (data.startsWith("ad_cancel_unlock:") || data.startsWith("ad_delete:")) {
            const orderId = data.replace(/ad_cancel_unlock:|ad_delete:/, "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status === "cancelled") {
                await ctx.answerCallbackQuery({ text: "Order not active!" });
                return;
            }

            if (order.user_id !== user.id) {
                await ctx.answerCallbackQuery({ text: "Not your ad!" });
                return;
            }

            // Handle Refunds for Sell Ads
            if ((order.status === "active" || order.status === "paused") && order.type === "sell") {
                await ctx.editMessageText("⏳ Unlocking funds & refunding...");
                try {
                    await db.cancelOrder(orderId); // Mark cancelled FIRST
                    const refundTx = await wallet.adminTransfer(user.wallet_address!, order.amount.toString(), order.token === 'USDT' ? env.USDT_ADDRESS : env.USDC_ADDRESS);

                    await ctx.editMessageText(
                        [
                            "✅ *Ad Cancelled & Funds Unlocked*",
                            "",
                            `Refunded: *${formatUSDC(order.amount)}*`,
                            `To: \`${truncateAddress(user.wallet_address!)}\``,
                            "",
                            `🔗 [View Refund Tx](${getExplorerUrl(refundTx)})`,
                        ].join("\n"),
                        { parse_mode: "Markdown" }
                    );
                } catch (error) {
                    console.error("Refund failed:", error);
                    await ctx.editMessageText("❌ Refund failed! Please contact support.");
                }
            } else {
                // Just cancel (Buy ads or already refunded)
                await db.cancelOrder(orderId);
                await ctx.editMessageText("🗑️ Ad deleted.");
            }
            await ctx.answerCallbackQuery();
        }

        // Pause Ad
        if (data.startsWith("ad_pause:")) {
            const orderId = data.replace("ad_pause:", "");
            await db.updateOrder(orderId, { status: "paused" });
            await ctx.answerCallbackQuery({ text: "Ad paused" });
            const keyboard = new InlineKeyboard()
                .text("▶️ Resume Ad", `ad_resume:${orderId}`)
                .text("🗑️ Delete Ad", `ad_delete:${orderId}`);
            await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
        }

        // Resume Ad
        if (data.startsWith("ad_resume:")) {
            const orderId = data.replace("ad_resume:", "");
            await db.updateOrder(orderId, { status: "active" });
            await ctx.answerCallbackQuery({ text: "Ad resumed" });
            const keyboard = new InlineKeyboard()
                .text("⏸️ Pause Ad", `ad_pause:${orderId}`)
                .text("🗑️ Delete Ad", `ad_delete:${orderId}`);
            await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
        }

        // Confirm Trade (Start Trade)
        if (data.startsWith("confirm_trade:")) {
            const orderId = data.replace("confirm_trade:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "Order no longer active!" });
                return;
            }

            // Prevent trading with self
            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "You can't trade with yourself!" });
                return;
            }

            try {
                if (order.type === "sell") {
                    await ctx.editMessageText("⏳ Initiating trade... checking seller balance.");

                    // 1. Double check seller still has the tokens in their bot wallet (Safety against drains)
                    // NOTE: For Sell Ads, funds were already moved to the relayer during creation. 
                    // The check below is only needed if we support "Direct" ads where funds are not pre-escrowed.
                    // For now, in P2PKerala, sell ads are pre-funded.
                    const seller = await db.getUserById(order.user_id);
                    if (!seller || !seller.wallet_address) throw new Error("Seller wallet not found.");

                    // 2. Atomic fill check (Race condition protection)
                    const filled = await db.fillOrder(order.id, order.amount);
                    if (!filled) {
                        await ctx.editMessageText("❌ Trade failed: Someone else just matched this ad.");
                        return;
                    }

                    await ctx.editMessageText("⏳ Locking crypto in escrow contract...");

                    const tokenSymbol = order.token || "USDC";
                    const tokenAddress = tokenSymbol === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;

                    // 🛠️ AUTO-DEPOSIT CHECK 🛠️
                    // If Seller created ad using Hot Wallet, funds might not be in Vault yet.
                    const vaultBalance = await escrow.getVaultBalance(seller.wallet_address!, tokenAddress);
                    if (parseFloat(vaultBalance) < order.amount) {
                        // ❌ External Wallets cannot auto-deposit since we don't have their private key
                        if (seller.wallet_type === 'external') {
                            await db.revertFillOrder(order.id, order.amount);
                            await ctx.editMessageText(
                                "❌ *Trade Failed*\n\nSeller (External Wallet) has insufficient Vault balance.\nFunds must be deposited to Vault manually via Mini App.",
                                { parse_mode: "Markdown" }
                            );
                            return;
                        }

                        await ctx.editMessageText("⏳ Seller vault needs funding. Attempting auto-deposit...");

                        // Check Hot Wallet
                        const hotBalance = await wallet.getTokenBalance(seller.wallet_address!, tokenAddress);
                        if (parseFloat(hotBalance) < order.amount) {
                            await db.revertFillOrder(order.id, order.amount);
                            await ctx.editMessageText("❌ Trade failed: Seller has insufficient funds!");
                            return;
                        }

                        try {
                            // Perform Deposit (Approve + Deposit)
                            // This requires Seller to have ETH for gas
                            await wallet.depositToVault(seller.wallet_index, order.amount.toString(), tokenAddress);
                            await ctx.editMessageText("✅ Auto-Deposit successful. Locking funds...");
                        } catch (err: any) {
                            console.error("Auto-deposit failed:", err);
                            await db.revertFillOrder(order.id, order.amount);
                            await ctx.editMessageText(`❌ Trade failed: Auto-deposit failed (likely insufficient ETH for gas). Details: ${err.message}`);
                            return;
                        }
                    }

                    await ctx.editMessageText("⏳ Locking crypto in escrow contract...");

                    try {
                        // 3. Relayer creates trade on Smart Contract
                        // Contract takes 1% (FEE_BPS=100) on release.
                        const tradeId = await escrow.createRelayedTrade(
                            seller.wallet_address!,
                            user.wallet_address!,
                            tokenAddress,
                            order.amount.toString(),
                            3600
                        );
                        // Old relayerCreateTrade returned { txHash, tradeId }, new one returns tradeId string
                        const txHash = "pending"; // We don't get hash easily from createRelayedTrade wrapper unless modified, but it logs it. 
                        // Actually createRelayedTrade returns tradeId. 
                        // To get hash we might need to modify service or just say "pending"
                        // For now let's assume we can live without hash or I should fix service to return both.
                        // I'll update service later if needed.

                        // 4. Create local Trade record
                        const trade = await db.createTrade({
                            order_id: order.id,
                            buyer_id: user.id,
                            seller_id: order.user_id,
                            token: tokenSymbol,
                            chain: "base",
                            amount: order.amount,
                            rate: order.rate,
                            fiat_amount: order.amount * order.rate * (1 - (env.FEE_PERCENTAGE / 2)),
                            fiat_currency: "INR",
                            fee_amount: order.amount * env.FEE_PERCENTAGE,
                            fee_percentage: env.FEE_PERCENTAGE,
                            buyer_receives: order.amount * (1 - env.FEE_PERCENTAGE),
                            payment_method: "UPI",
                            status: "in_escrow",
                            on_chain_trade_id: Number(tradeId),
                            escrow_tx_hash: txHash,
                            created_at: new Date().toISOString(),
                        });

                        await ctx.editMessageText(
                            `✅ Trade Started! Trade #${tradeId}\nCheck /mytrades to proceed with payment.`
                        );

                        // Notify Seller
                        if (seller.telegram_id) {
                            await ctx.api.sendMessage(
                                seller.telegram_id,
                                `🔔 *New Trade Started!*\n\nBuyer matches your ad for ${formatUSDC(order.amount, order.token)}.\nThey will send payment soon.\n\nCheck /mytrades to monitor status.`,
                                { parse_mode: "Markdown" }
                            );
                        }
                    } catch (blockchainError: any) {
                        console.error("Blockchain error during trade creation:", blockchainError);
                        // Critical: Revert the fill so the ad remains active!
                        await db.revertFillOrder(order.id, order.amount);
                        await ctx.editMessageText(`❌ Trade initiation failed: ${blockchainError.message || "Blockchain error"}. Ad has been restored to active.`);
                    }
                } else {
                    // ═══ TAKER IS SELLING (Filling a Buy Order) ═══
                    await ctx.editMessageText("⏳ Initiating trade...");

                    const seller = user; // The one clicking the button (Taker)
                    const tokenSymbol = order.token || "USDC";
                    const tokenAddress = tokenSymbol === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS;

                    // 1. Check Seller's Balance (Baseline Amount)
                    const balance = await wallet.getTokenBalance(seller.wallet_address!, tokenAddress);
                    const totalRequired = order.amount;
                    if (parseFloat(balance) < totalRequired) {
                        await ctx.editMessageText(
                            `❌ *Insufficient ${tokenSymbol} Balance*\n\nYou need *${formatUSDC(totalRequired, tokenSymbol)}* but have *${formatUSDC(parseFloat(balance), tokenSymbol)}*.\n\nDeposit funds to your wallet: \`${seller.wallet_address}\``,
                            { parse_mode: "Markdown" }
                        );
                        return;
                    }

                    await ctx.editMessageText(`⏳ Locking ${tokenSymbol} in escrow...`);

                    try {
                        // 2. Seller sends tokens to Relayer (Admin Wallet)
                        const relayerAddress = env.ADMIN_WALLET_ADDRESS;
                        const sellerTransferTx = await wallet.sendToken(seller.wallet_index, relayerAddress, totalRequired.toString(), tokenAddress);

                        // 3. Relayer creates Trade on Smart Contract
                        const buyerUser = await db.getUserById(order.user_id);

                        const { txHash, tradeId } = {
                            txHash: "pending", tradeId: await escrow.createRelayedTrade(
                                seller.wallet_address!, // Seller
                                buyerUser!.wallet_address!, // Buyer
                                tokenAddress,
                                order.amount.toString(),
                                3600
                            )
                        };

                        // 4. Create Trade Record
                        const trade = await db.createTrade({
                            order_id: order.id,
                            buyer_id: order.user_id, // Maker (Buyer)
                            seller_id: seller.id,    // Taker (Seller)
                            token: tokenSymbol,
                            chain: "base",
                            amount: order.amount,
                            rate: order.rate,
                            fiat_amount: order.amount * order.rate * (1 - (env.FEE_PERCENTAGE / 2)),
                            fiat_currency: "INR",
                            fee_amount: order.amount * env.FEE_PERCENTAGE,
                            fee_percentage: env.FEE_PERCENTAGE,
                            buyer_receives: order.amount * (1 - env.FEE_PERCENTAGE),
                            payment_method: "UPI",
                            status: "in_escrow",
                            on_chain_trade_id: Number(tradeId),
                            escrow_tx_hash: txHash,
                            created_at: new Date().toISOString(),
                        });

                        // 5. Mark Order as Filled
                        await db.updateOrder(order.id, { status: "filled", filled_amount: order.amount });

                        await ctx.editMessageText(
                            `✅ Trade Started! Trade #${tradeId}\nWaiting for Buyer to pay.\nCheck /mytrades.`
                        );

                        // Notify Buyer (Maker)
                        if (buyerUser && buyerUser.telegram_id) {
                            await ctx.api.sendMessage(
                                buyerUser.telegram_id,
                                `🔔 *Trade Started!* 🟢\n\nSeller matched your Buy Ad for ${formatUSDC(order.amount, tokenSymbol)}.\nCrypto is locked in escrow.\n\n👇 *Pay Now via UPI*`,
                                { parse_mode: "Markdown" }
                            );
                        }
                    } catch (blockchainError: any) {
                        console.error("Sell trade initiation failed:", blockchainError);
                        await ctx.editMessageText(`❌ Trade initiation failed: ${blockchainError.message || "Blockchain error"}.\n\n⚠️ If funds were already sent to the relayer, please contact support with this info.`);
                        // We don't mark as filled here, so the Buy ad remains active.
                    }
                }
            } catch (e) {
                console.error("Trade creation failed:", e);
                await ctx.editMessageText("❌ Failed to start trade. Blockchain error.");
            }
        }

        // Handle buy button (legacy)
        if (data.startsWith("buy:")) {
            const orderId = data.replace("buy:", "");
            const user = await ensureUser(ctx);
            const order = await db.getOrderById(orderId);

            if (!order || order.status !== "active") {
                await ctx.answerCallbackQuery({ text: "Order no longer available!" });
                return;
            }

            if (order.user_id === user.id) {
                await ctx.answerCallbackQuery({ text: "You can't buy your own order!" });
                return;
            }

            // Show trade confirmation
            const available = order.amount - order.filled_amount;
            const feeAmount = available * env.FEE_PERCENTAGE;
            const buyerReceives = available - feeAmount;

            const keyboard = new InlineKeyboard()
                .text("✅ Confirm Trade", `confirm_trade:${orderId}`)
                .text("❌ Cancel", "cancel_action");

            await ctx.editMessageText(
                [
                    "🤝 *Confirm Trade*",
                    "",
                    `Amount: ${formatUSDC(available)}`,
                    `Rate: ${formatINR(order.rate)}/USDC`,
                    `Total Fiat: ${formatINR(available * order.rate)}`,
                    `Fee (${(env.FEE_PERCENTAGE * 50).toFixed(1)}%): ${formatUSDC(feeAmount)}`,
                    `You receive: ${formatUSDC(buyerReceives)}`,
                    "",
                    `Payment: ${order.payment_methods.join(", ")}`,
                    `Seller: @${order.username || "anon"}`,
                    "",
                    "⚠️ After confirming, seller will deposit USDC to escrow.",
                    "You'll then send fiat via the specified payment method.",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );

            await ctx.answerCallbackQuery();
        }

        // ─────── TRADE MANAGEMENT HANDLERS ───────

        // View Trade Details
        if (data.startsWith("trade_view:")) {
            const tradeId = data.replace("trade_view:", "");
            const user = await ensureUser(ctx);
            const trade = await db.getTradeById(tradeId);

            if (!trade) {
                await ctx.answerCallbackQuery({ text: "Trade not found!" });
                return;
            }

            const isBuyer = trade.buyer_id === user.id;
            const isSeller = trade.seller_id === user.id;
            const partnerId = isBuyer ? trade.seller_id : trade.buyer_id;
            const [partner, order] = await Promise.all([
                db.getUserById(partnerId),
                db.getOrderById(trade.order_id)
            ]);

            const statusDescriptions: any = {
                'in_escrow': isBuyer ? "🟡 Pay the seller now!" : "🟡 Waiting for buyer payment...",
                'fiat_sent': isBuyer ? "🔵 You marked paid. Waiting for release." : "🔵 Buyer marked paid. Please check bank & Release.",
                'completed': "✅ Trade Completed.",
                'disputed': "🔴 Disputed. Admin will review."
            };

            const details = [
                `💰 *Trade #${trade.on_chain_trade_id || trade.id.slice(0, 4)}*`,
                "",
                `Role: ${isBuyer ? "🟢 Buyer" : "🔴 Seller"}`,
                `Status: *${trade.status.toUpperCase()}*`,
                `ℹ️ ${statusDescriptions[trade.status] || ""}`,
                "",
                `Amount: *${formatUSDC(trade.amount, trade.token)}*`,
                `Fiat: *${formatINR(trade.fiat_amount)}*`,
                `Rate: ${formatINR(trade.rate)}/${trade.token}`,
                "",
                `⚖️ Fee Split (1%):`,
                isSeller
                    ? `🔐 You Locked: *${formatUSDC(trade.amount * 1.005, trade.token)}*`
                    : `🔐 Seller Locked: *${formatUSDC(trade.amount * 1.005, trade.token)}*`,
                isBuyer
                    ? `📥 You Receive: *${formatUSDC(trade.amount * 0.995, trade.token)}*`
                    : `📥 Buyer Receives: *${formatUSDC(trade.amount * 0.995, trade.token)}*`,
                "",
                `Partner: ${partner?.username ? "@" + partner.username.replace(/_/g, "\\_") : "anon"}`,
                `Payment Method: ${trade.payment_method}`,
            ];

            // If user is buyer, show seller's payment details
            if (isBuyer && trade.payment_method === "UPI") {
                // Priority: Order details -> Partner profile
                const upiFromOrder = (order?.payment_details as any)?.upi;
                const upiId = upiFromOrder || partner?.upi_id;

                if (upiId) {
                    details.push(`💳 Seller UPI: ${upiId}`);
                } else {
                    details.push("⚠️ Seller hasn't shared UPI in profile.");
                }
            }

            details.push("", "━━━━━━━━━━━━━━━━━━━");

            const keyboard = new InlineKeyboard();

            // Buyer Actions
            if (isBuyer && trade.status === "in_escrow") {
                details.push("👇 *Action Required:* Send fiat to seller, then click 'I Have Paid'.");
                keyboard.text("✅ I Have Paid", `trade_pay:${trade.id}`).row();
                keyboard.text("❌ Cancel Trade", `trade_cancel:${trade.id}`).row();
            }

            // Seller Actions
            if (isSeller && trade.status === "fiat_sent") {
                details.push("👇 *Action Required:* Check your bank. If received, Release Crypto.");
                keyboard.text("🔓 Release Crypto", `trade_release:${trade.id}`).row();
                keyboard.text("⚠️ Dispute (Not Received)", `trade_dispute:${trade.id}`).row();
            }

            // Navigation
            keyboard.text("🔙 Back to Trades", "mytrades_view"); // Re-trigger /mytrades logic? No, better separate handler.
            // Actually I'll use text list for now as handler isn't registered for text command but I can use same logic.

            await ctx.editMessageText(details.join("\n"), {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            await ctx.answerCallbackQuery();
        }

        // Buyer Marks Paid
        if (data.startsWith("trade_pay:")) {
            const tradeId = data.replace("trade_pay:", "");
            const trade = await db.getTradeById(tradeId);
            if (!trade) return;

            await db.updateTrade(tradeId, { status: "fiat_sent" });
            await ctx.answerCallbackQuery({ text: "Marked as Paid! Seller notified." });

            const keyboard = new InlineKeyboard().text("👁️ Refresh Details", `trade_view:${tradeId}`);
            await ctx.editMessageText("✅ You marked this trade as PAID. Waiting for seller to release.", { reply_markup: keyboard });

            // Notify Seller
            const seller = await db.getUserById(trade.seller_id);
            if (seller && seller.telegram_id) {
                await ctx.api.sendMessage(
                    seller.telegram_id,
                    `💰 *Payment Marked as Sent!*\n\nBuyer says they have paid for Trade #${trade.on_chain_trade_id}.\n\nPlease check your bank account.\nIf received, click Release in /mytrades.`,
                    { parse_mode: "Markdown" }
                );
            }
        }

        // Seller Releases Crypto
        if (data.startsWith("trade_release:")) {
            const tradeId = data.replace("trade_release:", "");
            const trade = await db.getTradeById(tradeId);

            if (!trade || trade.status === "completed") {
                await ctx.answerCallbackQuery({ text: "Trade already completed!" });
                return;
            }

            await ctx.editMessageText("⏳ Releasing funds on blockchain... This may take a moment.");

            try {
                // Relayer calls Smart Contract Release
                const txHash = await escrow.release(trade.on_chain_trade_id!);

                await db.updateTrade(tradeId, { status: "completed", escrow_tx_hash: txHash });

                await ctx.editMessageText(
                    [
                        "✅ *Crypto Released!*",
                        "",
                        "Trade completed successfully.",
                        `🔗 [View Transaction](${getExplorerUrl(txHash)})`,
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );

                // Broadcast Success (Group Specific)
                try {
                    const order = await db.getOrderById(trade.order_id);
                    const targetGroup = (order?.payment_details as any)?.group_id;

                    if (targetGroup) {
                        await ctx.api.sendMessage(
                            String(targetGroup),
                            `✅ *Trade Completed!* 🎉\n\n💰 Volume: *${formatUSDC(trade.amount)}*\n🤝 P2P Swap executed successfully.\n\nStart trading now: /start`,
                            { parse_mode: "Markdown" }
                        ).catch(e => console.error(`Group Broadcast failed to ${targetGroup}:`, e));

                    } else if (env.BROADCAST_CHANNEL_ID) {
                        await ctx.api.sendMessage(
                            env.BROADCAST_CHANNEL_ID,
                            `✅ *Trade Completed!* 🎉\n\n💰 Volume: *${formatUSDC(trade.amount)}*\n🤝 P2P Swap executed successfully.\n\nStart trading now: /start`,
                            { parse_mode: "Markdown" }
                        ).catch(e => console.error("Admin Broadcast failed:", e));
                    }
                } catch (e) {
                    console.error("Trade broadcast error:", e);
                }

                // Notify Buyer
                const buyer = await db.getUserById(trade.buyer_id);
                if (buyer && buyer.telegram_id) {
                    await ctx.api.sendMessage(
                        buyer.telegram_id,
                        `✅ *Trade Completed!*\n\nSeller has released ${formatUSDC(trade.amount, trade.token)}.\nThe funds are now in your wallet (smart contract release).\n\nTransaction: [View on BaseScan](${getExplorerUrl(txHash)})`,
                        { parse_mode: "Markdown" }
                    );
                }

                // Update stats & Trust Scores
                await Promise.all([
                    db.completeUserTrade(trade.seller_id, true),
                    db.completeUserTrade(trade.buyer_id, true)
                ]);

            } catch (error) {
                console.error("Release failed:", error);
                await ctx.editMessageText("❌ Release failed. Please try again or contact support.");
            }
        }

        // Dispute
        if (data.startsWith("trade_dispute:")) {
            const tradeId = data.replace("trade_dispute:", "");
            await db.updateTrade(tradeId, { status: "disputed" });
            await ctx.editMessageText("⚠️ Dispute opened. Support will review this case.");

            // Notify Admins
            const admins = env.ADMIN_IDS;
            for (const adminId of admins) {
                const kb = new InlineKeyboard()
                    .text("⚖️ Resolve (Release)", `resolve:${tradeId}:buyer`).row()
                    .text("🔁 Resolve (Refund)", `resolve:${tradeId}:seller`).row()
                    .text("🤖 AI Analysis", `ai_analyze_dispute:${tradeId}`);

                await ctx.api.sendMessage(adminId, `🚨 *New Dispute Raised!*\nTrade: \`${tradeId}\`\nPlease review carefully.`, {
                    parse_mode: "Markdown",
                    reply_markup: kb
                });
            }
        }

        // AI Dispute Analysis
        if (data.startsWith("ai_analyze_dispute:")) {
            if (!isAdmin(ctx)) return;
            const tradeId = data.replace("ai_analyze_dispute:", "");
            const trade = await db.getTradeById(tradeId);
            if (!trade) return;

            await ctx.answerCallbackQuery({ text: "🤖 AI is analyzing evidence..." });

            const [buyer, seller] = await Promise.all([
                db.getUserById(trade.buyer_id),
                db.getUserById(trade.seller_id)
            ]);

            const analysis = await ai.analyzeDispute({
                tradeAmount: trade.amount,
                fiatAmount: trade.fiat_amount,
                buyerName: buyer?.username || "Anon",
                sellerName: seller?.username || "Anon",
                buyerTrades: buyer?.trade_count || 0,
                sellerTrades: seller?.trade_count || 0,
                buyerTrustScore: buyer?.trust_score || 0,
                sellerTrustScore: seller?.trust_score || 0,
                reason: "User raised dispute (auto-check)",
                evidence: [] // In production, we'd pass payment proof analysis here
            });

            await ctx.reply(
                [
                    "🤖 *AI Dispute Analysis*",
                    "",
                    `Recommendation: *${analysis.recommendation.toUpperCase()}*`,
                    `Confidence: ${Math.round(analysis.confidence * 100)}%`,
                    "",
                    `Reasoning: _${analysis.reasoning}_`,
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
        }

        // Admin: List Disputes
        if (data === "admin_disputes_list") {
            if (!isAdmin(ctx)) return;
            const disputes = await db.getDisputedTrades();

            if (disputes.length === 0) {
                await ctx.answerCallbackQuery({ text: "✅ No active disputes!" });
                return;
            }

            const keyboard = new InlineKeyboard();
            disputes.forEach(d => {
                keyboard.text(`⚖️ Trade #${d.on_chain_trade_id || d.id.slice(0, 4)}`, `trade_view:${d.id}`).row();
            });
            keyboard.text("🔙 Back to Dashboard", "admin_stats_refresh");

            await ctx.editMessageText("⚖️ *Active Disputes*\nSelect a trade to investigate:", {
                parse_mode: "Markdown",
                reply_markup: keyboard
            });
            await ctx.answerCallbackQuery();
        }

        // Admin: Refresh Stats (Also acts as Dashboard home)
        if (data === "admin_stats_refresh") {
            if (!isAdmin(ctx)) return;
            try {
                const [stats, relayerUsdc, relayerEth, contractFees] = await Promise.all([
                    db.getStats(),
                    wallet.getTokenBalance(env.ADMIN_WALLET_ADDRESS, env.USDC_ADDRESS, 'base'),
                    wallet.getBalances(env.ADMIN_WALLET_ADDRESS).then(b => b.eth),
                    wallet.getTokenBalance(env.ESCROW_CONTRACT_ADDRESS, env.USDC_ADDRESS, 'base')
                ]);

                const keyboard = new InlineKeyboard()
                    .text("⚖️ View Active Disputes", "admin_disputes_list").row()
                    .text("🔄 Refresh Stats", "admin_stats_refresh");

                await ctx.editMessageText(
                    [
                        "⚙️ *Admin Dashboard*",
                        "",
                        "📈 *System Stats*",
                        `Users: ${stats.total_users}`,
                        `Ads: ${stats.active_orders} active`,
                        `Trades: ${stats.total_trades} (${stats.completed_trades} ok)`,
                        `Volume: ${formatUSDC(stats.total_volume_usdc)}`,
                        "",
                        "💰 *Relayer Wallet*",
                        `Address: \`${truncateAddress(env.ADMIN_WALLET_ADDRESS)}\``,
                        `Balance: *${relayerUsdc} USDC*`,
                        `Gas: *${relayerEth} ETH*`,
                        "",
                        "🏧 *Escrow Contract*",
                        `Collected Fees: *${contractFees} USDC*`,
                        "",
                        "━━━━━━━━━━━━━━━━",
                        "Fees are sent to your wallet automatically upon release."
                    ].join("\n"),
                    { parse_mode: "Markdown", reply_markup: keyboard }
                );
            } catch (e) {
                await ctx.answerCallbackQuery({ text: "❌ Refresh failed." });
            }
        }

        // My Trades View Handler (Button)
        if (data === "mytrades_view") {
            const user = await ensureUser(ctx);
            try {
                const trades = await db.getUserTrades(user.id);

                if (trades.length === 0) {
                    await ctx.editMessageText("📭 You have no active trades.");
                    await ctx.answerCallbackQuery();
                    return;
                }

                const keyboard = new InlineKeyboard();

                const statusMap: any = {
                    'created': '🆕 Created',
                    'in_escrow': '🟡 In Escrow',
                    'fiat_sent': '🔵 Paid',
                    'completed': '✅ Completed',
                    'disputed': '🔴 Disputed',
                    'cancelled': '❌ Cancelled'
                };

                trades.forEach((t: any) => {
                    const isBuyer = t.buyer_id === user.id;
                    const role = isBuyer ? "🟢 Buying" : "🔴 Selling";
                    const amt = formatUSDC(t.amount, t.token);
                    const status = statusMap[t.status] || t.status;

                    keyboard.text(`${role} ${amt} (${status})`, `trade_view:${t.id}`).row();
                });

                await ctx.editMessageText("📋 *Your Trades*\nSelect a trade to view actions:", {
                    parse_mode: "Markdown",
                    reply_markup: keyboard
                });
            } catch (e) {
                console.error("MyTrades error:", e);
                await ctx.answerCallbackQuery({ text: "❌ Failed to fetch trades." });
            }
            await ctx.answerCallbackQuery();
        }

        // Handle dispute resolution
        if (data.startsWith("resolve:")) {
            if (!isAdmin(ctx)) {
                await ctx.answerCallbackQuery({ text: "Admin only!" });
                return;
            }

            const [, tradeId, action] = data.split(":");
            const releaseToBuyer = action === "buyer";

            try {
                // Update database
                await db.updateTrade(tradeId, {
                    status: "resolved",
                    resolution: releaseToBuyer ? "Released to buyer" : "Refunded to seller",
                    resolved_by: (await ensureUser(ctx)).id,
                });

                await ctx.editMessageText(
                    `✅ Dispute resolved! ${releaseToBuyer ? "Released to buyer" : "Refunded to seller"}.`
                );
            } catch (error) {
                await ctx.answerCallbackQuery({ text: "Failed to resolve dispute." });
            }
        }

        // Handle cancel
        if (data.startsWith("cancel_action")) {
            // Check for embedded user ID
            if (data.includes(":")) {
                const parts = data.split(":");
                const creatorId = parseInt(parts[1]);
                if (!isNaN(creatorId) && ctx.from.id !== creatorId) {
                    await ctx.answerCallbackQuery({ text: "⚠️ Expected creator to cancel.", show_alert: true });
                    return;
                }
            } else {
                // Reject legacy buttons without ID
                await ctx.answerCallbackQuery({ text: "⚠️ Action expired or invalid.", show_alert: true });
                return;
            }

            await ctx.deleteMessage().catch(() => { });
            ctx.session.ad_draft = undefined;
            ctx.session.send_draft = undefined;
            ctx.session.awaiting_input = undefined;
            await ctx.answerCallbackQuery({ text: "Action cancelled." });
        }

        // Handle setup UPI button
        if (data === "setup_upi") {
            ctx.session.awaiting_input = "upi_id";
            await ctx.editMessageText(
                [
                    "📱 *Enter your UPI ID*",
                    "",
                    "Type your UPI ID below:",
                    "",
                    "Examples: `yourname@upi`, `9876543210@paytm`",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle export key button (from /wallet)
        if (data === "export_key") {
            // Redirect to /export flow with confirmation
            const user = await ensureUser(ctx);
            if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
                await ctx.answerCallbackQuery({ text: "No wallet found!" });
                return;
            }

            const keyboard = new InlineKeyboard()
                .text("⚠️ Yes, show my private key", "confirm_export")
                .row()
                .text("❌ Cancel", `cancel_action:${user.id}`);

            await ctx.editMessageText(
                [
                    "🔒 *Export Private Key*",
                    "",
                    "⚠️ *WARNING:*",
                    "• Anyone with your private key can STEAL your funds",
                    "• NEVER share it with anyone",
                    "• The key will auto-delete in 60 seconds",
                    "",
                    "Are you sure?",
                ].join("\n"),
                { parse_mode: "Markdown", reply_markup: keyboard }
            );
            await ctx.answerCallbackQuery();
        }

        // Handle confirm export — SHOW THE KEY
        if (data === "confirm_export") {
            const user = await ensureUser(ctx);

            if (!user.wallet_address || !env.MASTER_WALLET_SEED) {
                await ctx.answerCallbackQuery({ text: "No wallet found!" });
                return;
            }

            try {
                const derived = wallet.deriveWallet(user.wallet_index);

                // Send the key
                const keyMsg = await ctx.reply(
                    [
                        "🔐 *YOUR PRIVATE KEY*",
                        "",
                        `\`${derived.privateKey}\``,
                        "",
                        `Address: \`${derived.address}\``,
                        "",
                        "⚠️ This message will self-destruct in 60 seconds.",
                        "📸 Screenshot it NOW and store it safely!",
                        "",
                        "With this key you can import your wallet into:",
                        "• MetaMask",
                        "• Trust Wallet",
                        "• Rabby",
                        "• Any EVM wallet",
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );

                // Delete the confirmation message
                await ctx.editMessageText("✅ Private key sent below ⬇️ (auto-deletes in 60s)");

                // Auto-delete key message after 60 seconds
                setTimeout(async () => {
                    try {
                        await ctx.api.deleteMessage(keyMsg.chat.id, keyMsg.message_id);
                        await ctx.api.sendMessage(keyMsg.chat.id,
                            "🗑️ Private key message deleted for security.\n\nUse /export again if needed."
                        );
                    } catch {
                        // Message may already be deleted
                    }
                }, 60000);

                await ctx.answerCallbackQuery();
                handled = true;
            } catch (error) {
                console.error("Export error:", error);
                await ctx.answerCallbackQuery({ text: "Failed to export key." });
                handled = true;
            }
        }

        // Default fallback to prevent loading spinners on unhandled buttons
        if (!handled) {
            try {
                await ctx.answerCallbackQuery();
            } catch (e) {
                // Ignore already answered errors
            }
        }
    } catch (error: any) {
        console.error("CRITICAL: Callback handler crashed:", error);
        try {
            await ctx.answerCallbackQuery({ text: "❌ System Error: " + error.message, show_alert: true });
        } catch (e) { }
    }
});

// ═══════════════════════════════════════════════════════════════
//              NATURAL LANGUAGE HANDLER (AI)
// ═══════════════════════════════════════════════════════════════

bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    console.log(`[BOT] Received text: "${text}" from ${ctx.from.id} in ${ctx.chat.type} (${ctx.chat.id})`);

    // Skip commands
    if (text.startsWith("/")) return;

    const botInfo = await ctx.api.getMe();
    const botName = botInfo.username;
    console.log(`[BOT] My username: ${botName}`);

    let cleanText = text;

    // Strip mention if present (e.g. "@MyBot sell 100") - Case Insensitive
    if (botName) {
        const mentionRegex = new RegExp(`^@${botName}`, "i");
        if (mentionRegex.test(text)) {
            // Replace only the start, case-insensitively
            cleanText = text.replace(mentionRegex, "").trim();
        }
    }
    console.log(`[BOT] Clean text: "${cleanText}"`);

    // In groups, ONLY reply if mentioned or replying to bot
    if (ctx.chat.type !== "private") {
        const isMentioned = botName ? new RegExp(`@${botName}`, "i").test(text) : false;
        const isReplyToBot = ctx.message.reply_to_message?.from?.id === botInfo.id;

        console.log(`[BOT] Group logic - Mentioned: ${isMentioned}, ReplyToBot: ${isReplyToBot}`);

        if (!isMentioned && !isReplyToBot) {
            console.log("[BOT] Ignoring non-mention in group");
            return; // Ignore random group chatter
        }
    }

    const user = await ensureUser(ctx);

    // Handle awaiting input states
    if (ctx.session.awaiting_input === "wallet_address") {
        // Validate Ethereum address
        if (/^0x[a-fA-F0-9]{40}$/.test(text.trim())) {
            await db.updateUser(user.id, { wallet_address: text.trim() });
            ctx.session.awaiting_input = undefined;
            ctx.session.wallet_address = text.trim();
            await ctx.reply(`✅ Wallet set to \`${truncateAddress(text.trim())}\`\n\nYou're ready to trade! Try /sell or /buy`, { parse_mode: "Markdown" });
            return;
        } else {
            await ctx.reply("❌ Invalid address. Please send a valid Base wallet address (0x...)");
            return;
        }
    }

    // --- SEND CRYPTO FLOW ---
    if (ctx.session.awaiting_input === "send_to_address") {
        const addr = text.trim();
        if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
            ctx.session.send_draft = { ...ctx.session.send_draft, to_address: addr };
            ctx.session.awaiting_input = "send_amount";

            const token = ctx.session.send_draft?.token || "USDC";

            await ctx.reply(
                [
                    "💸 *Send Crypto — Step 2/3*",
                    "",
                    `Token: *${token}*`,
                    `To: \`${truncateAddress(addr)}\``,
                    "",
                    `How much ${token} do you want to send?`,
                    "",
                    "Send the amount (e.g., `100`):",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        } else {
            await ctx.reply("❌ Invalid address. Please send a valid wallet address (0x...)");
            return;
        }
    }

    if (ctx.session.awaiting_input === "send_amount") {
        const amount = parseFloat(text.trim());
        if (isNaN(amount) || amount <= 0) {
            await ctx.reply("❌ Invalid amount. Please send a number.");
            return;
        }

        const draft = ctx.session.send_draft;
        if (!draft) return;

        const token = draft.token || "USDC";
        const addr = draft.to_address || "";

        // Check balance
        const balance = draft.token === "ETH"
            ? await wallet.getBalances(user.wallet_address!).then(b => b.eth)
            : await wallet.getTokenBalance(user.wallet_address!, draft.token_address!);

        if (parseFloat(balance) < amount) {
            await ctx.reply(`❌ Insufficient balance! Your ${token} balance is ${balance}.`);
            return;
        }

        if (ctx.session.send_draft) {
            ctx.session.send_draft.amount = amount;
        }
        ctx.session.awaiting_input = undefined;

        const keyboard = new InlineKeyboard()
            .text("✅ Confirm & Send", "confirm_send")
            .text("❌ Cancel", "cancel_action");

        await ctx.reply(
            [
                "💸 *Send Crypto — Final Step*",
                "",
                `Token: *${token}*`,
                `Amount: *${amount} ${token}*`,
                `To: \`${addr}\``,
                "",
                "⚠️ *Confirm this transaction?*",
                "This action cannot be undone.",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    if (ctx.session.awaiting_input === "upi_id") {
        const upiId = text.trim().toLowerCase();

        // Basic UPI format validation
        if (!upiId.includes("@") || upiId.length < 5) {
            await ctx.reply(
                [
                    "❌ Invalid UPI format.",
                    "",
                    "UPI IDs look like: `yourname@upi`",
                    "",
                    "Try again or send /upi to skip.",
                ].join("\n"),
                { parse_mode: "Markdown" }
            );
            return;
        }

        await db.updateUser(user.id, { upi_id: upiId });
        ctx.session.awaiting_input = undefined;

        const keyboard = new InlineKeyboard()
            .text("📢 Create Ad Now", "newad_start")
            .text("🔍 Browse Ads", "ads:all");

        await ctx.reply(
            [
                "✅ *UPI ID Saved!*",
                "",
                `📱 UPI: \`${upiId}\``,
                "",
                "You're all set! What would you like to do?",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    // ─────── GUIDED AD CREATION (Step-by-Step) ───────

    // Step 1: User sends AMOUNT
    if (ctx.session.awaiting_input?.startsWith("ad_amount_")) {
        const adType = ctx.session.awaiting_input.replace("ad_amount_", "");
        const amount = parseFloat(text.trim());

        if (isNaN(amount) || amount <= 0) {
            await ctx.reply("❌ Invalid amount. Send a number like `100` or `50.5`", { parse_mode: "Markdown" });
            return;
        }

        const token = ctx.session.ad_draft?.token || "USDC";
        const minAmount = 1;

        if (amount < minAmount) {
            await ctx.reply(`❌ Minimum amount is ${minAmount} ${token}.`);
            return;
        }

        if (amount > 50000) {
            await ctx.reply(`❌ Maximum amount is 50,000 ${token}.`);
            return;
        }

        // Store amount in session (preserve token) and ask for rate
        ctx.session.ad_draft = { ...ctx.session.ad_draft, type: adType, amount };

        ctx.session.awaiting_input = `ad_rate_${adType}`;

        await ctx.reply(
            [
                `📢 *Create ${adType.toUpperCase()} Ad — Step 2/3*`,
                "",
                `Amount: *${formatUSDC(amount, token)}*  ✅`,
                "",
                `What's your rate in INR per ${token}?`,
                "",
                "Send the rate (e.g., `88` or `92.5`):",
                "",
                `_Market rate: ~₹85-90/${token}_`,
            ].join("\n"),
            { parse_mode: "Markdown" }
        );
        return;
    }

    // Step 2: User sends RATE
    if (ctx.session.awaiting_input?.startsWith("ad_rate_")) {
        const adType = ctx.session.awaiting_input.replace("ad_rate_", "");
        const rate = parseFloat(text.trim());

        if (isNaN(rate) || rate <= 0) {
            await ctx.reply("❌ Invalid rate. Send a number like `88` or `92.5`", { parse_mode: "Markdown" });
            return;
        }

        if (rate < 50 || rate > 200) {
            await ctx.reply("⚠️ Rate seems unusual. Normal range: ₹50-200/USDC. Send again or continue.");
        }

        // Store rate in session and ask for payment method
        ctx.session.ad_draft = { ...ctx.session.ad_draft, rate };
        const token = ctx.session.ad_draft?.token || "USDC";

        ctx.session.awaiting_input = `ad_payment_${adType}`;
        const draft = ctx.session.ad_draft!;

        const keyboard = new InlineKeyboard()
            .text("💳 UPI", `ad_pay:upi`)
            .text("🏦 IMPS", `ad_pay:imps`)
            .row()
            .text("🏦 NEFT", `ad_pay:neft`)
            .text("💳 All Methods", `ad_pay:all`);

        await ctx.reply(
            [
                `📢 *Create ${adType.toUpperCase()} Ad — Step 3/3*`,
                "",
                `Amount: *${formatUSDC(draft.amount ?? 0, token)}*  ✅`,
                `Rate: *${formatINR(rate)}/${token}*  ✅`,
                `Total: *${formatINR((draft.amount ?? 0) * rate)}*`,
                "",
                "Select payment method:",
            ].join("\n"),
            { parse_mode: "Markdown", reply_markup: keyboard }
        );
        return;
    }

    // Try AI intent parsing
    try {
        // Save to conversation history
        ctx.session.conversation_history = ctx.session.conversation_history || [];
        ctx.session.conversation_history.push({ role: "user", content: cleanText });

        // If OpenAI is configured, use AI parsing
        let intent;
        if (env.OPENAI_API_KEY) {
            intent = await ai.parseIntent(cleanText, ctx.session.conversation_history);
        } else {
            // Fallback to keyword matching
            intent = (ai as any).fallbackParse
                ? (ai as any).fallbackParse(cleanText)
                : { intent: "UNKNOWN", confidence: 0, params: {}, response: "" };
        }

        // Capture Group ID for Ad Creation
        if (intent.intent === "CREATE_SELL_ORDER" || intent.intent === "CREATE_BUY_ORDER") {
            if (ctx.chat.type === "supergroup" || ctx.chat.type === "group") {
                // Attach group ID to params so we know where to broadcast later
                intent.params.target_group_id = ctx.chat.id;
            }
        }

        // Save AI response to history
        ctx.session.conversation_history.push({
            role: "assistant",
            content: intent.response,
        });

        // Keep history manageable
        if (ctx.session.conversation_history.length > 20) {
            ctx.session.conversation_history = ctx.session.conversation_history.slice(-10);
        }

        // Route based on intent
        switch (intent.intent) {
            case "CREATE_SELL_ORDER":
                if (intent.params.amount && intent.params.rate) {


                    // Secure callback with UserID
                    const callbackData = `confirm_sell:${intent.params.amount}:${intent.params.rate}:${ctx.from.id}`;
                    console.log(`DEBUG: Creating SELL button with data: ${callbackData}`);

                    const keyboard = new InlineKeyboard()
                        .text("✅ Confirm Order", callbackData)
                        .text("❌ Cancel", "cancel_action");

                    const feeAmt = intent.params.amount * env.FEE_PERCENTAGE;
                    await ctx.reply(
                        [
                            "📝 *Create Sell Order*",
                            "",
                            `Amount: ${formatUSDC(intent.params.amount)}`,
                            `Rate: ${formatINR(intent.params.rate)}/USDC`,
                            `Total: ${formatINR(intent.params.amount * intent.params.rate)}`,
                            `Fee (${(env.FEE_PERCENTAGE * 50).toFixed(1)}%): ${formatUSDC(feeAmt)}`,
                            `Buyer receives: ${formatUSDC(intent.params.amount - feeAmt)}`,
                            `Payment: ${intent.params.paymentMethod || "UPI"}`,
                            "",
                            "Confirm to list this order?",
                        ].join("\n"),
                        { parse_mode: "Markdown", reply_markup: keyboard }
                    );
                } else {
                    await ctx.reply(intent.response || "Please provide amount and rate.\n\nExample: *sell 100 usdc at 88*", { parse_mode: "Markdown" });
                }
                break;

            case "CREATE_BUY_ORDER":
                if (intent.params.amount && intent.params.rate) {


                    const callbackData = `confirm_buy:${intent.params.amount}:${intent.params.rate}:${ctx.from.id}`;
                    console.log(`DEBUG: Creating BUY button with data: ${callbackData}`);

                    const keyboard = new InlineKeyboard()
                        .text("✅ Confirm Order", callbackData)
                        .text("❌ Cancel", `cancel_action:${ctx.from.id}`);

                    await ctx.reply(
                        [
                            "📝 *Create Buy Order*",
                            "",
                            `Amount: ${formatUSDC(intent.params.amount)}`,
                            `Rate: ${formatINR(intent.params.rate)}/USDC`,
                            `Total: ${formatINR(intent.params.amount * intent.params.rate)}`,
                            `Payment: ${intent.params.paymentMethod || "UPI"}`,
                            "",
                            "Confirm to list this order?",
                        ].join("\n"),
                        { parse_mode: "Markdown", reply_markup: keyboard }
                    );
                } else if (intent.params.amount) {
                    // Just amount, ask for rate
                    ctx.session.ad_draft = { type: "buy", amount: intent.params.amount, token: "USDC" };
                    ctx.session.awaiting_input = "ad_rate_buy";
                    await ctx.reply(`I've set the amount to ${intent.params.amount} USDC.\n\nAt what rate (INR) do you want to buy?`);
                } else {
                    await ctx.reply(intent.response || "Please provide amount and rate.\n\nExample: *buy 100 usdc at 85*", { parse_mode: "Markdown" });
                }
                break;

            case "VIEW_ORDERS":
                // Trigger /orders logic
                await ctx.reply("📊 Loading orders...");
                // Re-use orders command
                try {
                    const orders = await db.getActiveOrders(undefined, "USDC", 10);
                    if (orders.length === 0) {
                        await ctx.reply("No orders available right now. Be the first! /sell");
                    } else {
                        const list = orders.map((o, i) => formatOrder(o, i)).join("\n\n");
                        try {
                            await ctx.reply(`📊 *Order Book*\n\n${list}`, { parse_mode: "Markdown" });
                        } catch (err: any) {
                            console.error("VIEW_ORDERS Markdown Error:", err);
                            console.log("Failed Payload:", list);
                            // Fallback to plain text
                            await ctx.reply(`📊 Order Book (Plain Text - Format Error)\n\n${list}`);
                        }
                    }
                } catch (err) {
                    console.error("VIEW_ORDERS Database Error:", err);
                    await ctx.reply("❌ Could not load orders.");
                }
                break;

            case "CHECK_BALANCE":
                if (user.wallet_address) {
                    try {
                        const balance = await wallet.getTokenBalance(user.wallet_address, env.USDC_ADDRESS, 'base');
                        const ethBalance = await wallet.getBalances(user.wallet_address).then(b => b.eth);
                        await ctx.reply(`💰 Balance: *${balance} USDC*\n⛽ Gas: *${ethBalance} ETH*\n\nAddress: \`${truncateAddress(user.wallet_address)}\``, { parse_mode: "Markdown" });
                    } catch {
                        await ctx.reply("⚠️ Could not fetch balance right now.");
                    }
                } else {
                    await ctx.reply("No wallet set! Use /wallet to set your address.");
                }
                break;

            case "SEND_CRYPTO":
                {
                    const amount = intent.params.amount;
                    const token = intent.params.token || "USDC";
                    const addr = intent.params.address;

                    if (amount && addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) {
                        // User gave all details, jump to payment checks
                        const tokenUpper = token.toUpperCase();
                        const tokenAddress = tokenUpper === "ETH" ? "native" : (tokenUpper === "USDT" ? env.USDT_ADDRESS : env.USDC_ADDRESS);

                        ctx.session.send_draft = {
                            to_address: addr,
                            token: tokenUpper,
                            token_address: tokenAddress,
                            amount: parseFloat(amount)
                        };

                        // Check balance
                        const balance = tokenUpper === "ETH"
                            ? await wallet.getBalances(user.wallet_address!).then(b => b.eth)
                            : await wallet.getTokenBalance(user.wallet_address!, tokenAddress);
                        if (parseFloat(balance) < parseFloat(amount)) {
                            await ctx.reply(`❌ Insufficient balance! Your ${token.toUpperCase()} balance is ${balance}.`);
                            return;
                        }

                        const keyboard = new InlineKeyboard()
                            .text("✅ Confirm & Send", "confirm_send")
                            .text("❌ Cancel", `cancel_action:${ctx.from.id}`);

                        await ctx.reply(
                            [
                                "💸 *Send Crypto — AI Confirmation*",
                                "",
                                `Token: *${token.toUpperCase()}*`,
                                `Amount: *${amount} ${token.toUpperCase()}*`,
                                `To: \`${addr}\``,
                                "",
                                "⚠️ *Confirm this transaction?*",
                                "This action cannot be undone.",
                            ].join("\n"),
                            { parse_mode: "Markdown", reply_markup: keyboard }
                        );
                    } else {
                        // Not enough details, start the flow
                        ctx.session.send_draft = {};
                        const keyboard = new InlineKeyboard()
                            .text("💵 USDC", "send_token:USDC")
                            .text("dt USDT", "send_token:USDT")
                            .text("💎 ETH", "send_token:ETH")
                            .row()
                            .text("❌ Cancel", "cancel_action");

                        await ctx.reply(
                            [
                                "💸 *Withdraw Crypto*",
                                "",
                                "I can help you send crypto to any Base wallet.",
                                "",
                                "Which token would you like to send?",
                            ].join("\n"),
                            { parse_mode: "Markdown", reply_markup: keyboard }
                        );
                    }
                }
                break;

            case "BRIDGE_TOKENS":
                await ctx.reply(
                    [
                        "🌉 *Bridge Tokens*",
                        "",
                        intent.response,
                        "",
                        'Tell me the full details, e.g.:',
                        '"bridge 50 usdc from base to ethereum"',
                    ].join("\n"),
                    { parse_mode: "Markdown" }
                );
                break;

            case "HELP":
                await ctx.reply(intent.response || "Type /help for full instructions!");
                break;

            case "PROFILE":
                // Trigger profile command
                await ctx.api.sendMessage(ctx.chat.id, "Loading profile...");
                break;

            default:
                await ctx.reply(intent.response || "I'm not sure what you mean. Try /help to see what I can do! 🤖");
        }
    } catch (error) {
        logger.error("MESSAGE_HANDLER_ERROR", "Error in message handler", error);
        await ctx.reply("🤖 Something went wrong. Try again or use /help for commands.");
    }
});

// ═══════════════════════════════════════════════════════════════
//              PHOTO HANDLER (Payment Proofs)
// ═══════════════════════════════════════════════════════════════

bot.on("message:photo", async (ctx) => {
    const user = await ensureUser(ctx);

    if (ctx.session.current_trade_id) {
        const trade = await db.getTradeById(ctx.session.current_trade_id);
        if (!trade) return;

        // Highest resolution
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const file = await ctx.api.getFile(photo.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

        const statusMsg = await ctx.reply("📸 *Analyzing payment proof with AI...*", { parse_mode: "Markdown" });

        // AI Vision Analysis
        const analysis = await ai.analyzePaymentProof(
            fileUrl,
            trade.fiat_amount,
            trade.payment_method === "UPI" ? (user.upi_id || "Seller") : "Seller"
        );

        let verificationText = "";
        if (analysis.confidence > 0.7) {
            if (analysis.amountMatch && analysis.status === "success") {
                verificationText = "✅ *AI Verification:* Payment appears valid.";
            } else {
                verificationText = `⚠️ *AI Warning:* ${analysis.reason || "Details do not perfectly match."}`;
            }
        }

        await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            [
                "📸 *Payment proof received!*",
                "",
                `Trade: \`#${trade.on_chain_trade_id || trade.id.slice(0, 4)}\``,
                verificationText,
                "",
                "The seller has been notified to check their account.",
                "If they don't respond, you can open a dispute via the Mini App.",
            ].join("\n"),
            { parse_mode: "Markdown" }
        );

        // Notify Seller
        const seller = await db.getUserById(trade.seller_id);
        if (seller && seller.telegram_id) {
            await ctx.api.sendPhoto(seller.telegram_id, photo.file_id, {
                caption: `📸 *Payment Proof Attached!*\n\nBuyer says they paid ₹${trade.fiat_amount}.\n${verificationText}`,
                parse_mode: "Markdown"
            });
        }
    } else {
        await ctx.reply(
            "📸 Got your photo! If this is a payment proof, first open the trade in /mytrades and then send the proof."
        );
    }
});

// ═══════════════════════════════════════════════════════════════
//                    ERROR HANDLER
// ═══════════════════════════════════════════════════════════════

bot.catch((err) => {
    console.error("Bot error:", err);
});

// Register commands with Telegram for autocomplete
bot.api.setMyCommands([
    { command: "start", description: "Start the bot" },
    { command: "newad", description: "Create a buy/sell ad" },
    { command: "ads", description: "Browse live P2P ads" },
    { command: "myads", description: "Manage your ads" },
    { command: "mytrades", description: "Your trade history" },
    { command: "portfolio", description: "Check balance & send" },
    { command: "wallet", description: "Wallet settings" },
    { command: "payment", description: "Set payment methods (UPI/Phone/Bank)" },
    { command: "profile", description: "Your stats & profile" },
    { command: "help", description: "How to use this bot" },
    { command: "send", description: "Withdraw crypto" },
    { command: "bridge", description: "Bridge tokens" },
]).catch((err: any) => console.error("setMyCommands error:", err));

export { bot, notifyTrader };
