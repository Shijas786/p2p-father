import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing in .env");
  process.exit(1);
}

const targetGroupId = process.argv[2] || process.env.COMMUNITY_CHAT_ID;

if (!targetGroupId) {
  console.log("Usage: npx tsx scratch/post_variants.js <CHAT_ID_OR_USERNAME>");
  console.log("Example: npx tsx scratch/post_variants.js @mygroupusername");
  console.log("Example: npx tsx scratch/post_variants.js -100123456789");
  process.exit(0);
}

const bot = new Bot(botToken);

const botLink = process.env.BOT_USERNAME ? `https://t.me/${process.env.BOT_USERNAME}` : "https://t.me/P2PFatherBot";
const webUrl = process.env.WEBAPP_URL || "https://p2pfather.com";
const groupLink = process.env.COMMUNITY_INVITE_LINK || (targetGroupId.startsWith("@") ? `https://t.me/${targetGroupId.replace("@", "")}` : "https://t.me/P2PFatherGroup");

const variants = [
  // --- Category A: Security & Escrow ---
  {
    id: 1,
    title: "1. Anti-Scam & Smart Escrow Protection",
    text: `🛡️ <b>TIRED OF P2P SCAMS & BANK FREEZES?</b> 🛡️\n\nTrade crypto safely with <b>P2P Father</b> — Telegram's most secure decentralized P2P exchange with <b>Smart Contract Escrow</b>!\n\n🚨 <b>Why Risk Your Funds Elsewhere?</b>\n🔒 <b>100% Locked Escrow</b>: Sellers can't take off with your crypto.\n⚡ <b>Verified Instant Payouts</b>: UPI, IMPS, Bank Transfer & Local Payments.\n⚖️ <b>3-Way Live Dispute Resolution</b>: Real admins step in within minutes if needed.\n🎁 <b>0% Platform Fees</b>: Limited-time launch offer!\n\nDon't compromise on security. Start trading safe today! 👇\n🤖 <b>Start Trading:</b> ${botLink}\n🌐 <b>Website:</b> ${webUrl}\n💬 <b>Join Group:</b> ${groupLink}`
  },
  {
    id: 2,
    title: "2. Zero Risk Escrow Guarantee",
    text: `🔒 <b>NEVER LOSE CRYPTO ON P2P AGAIN!</b>\n\nWith <b>P2P Father</b>, your funds remain 100% secured inside on-chain smart contract escrow until you verify payment.\n\n✅ Automated Escrow Lock & Release\n✅ 24/7 Dispute Admin Support\n✅ Zero Fake Payment Screenshots\n\n👉 <b>Try Safe P2P Now:</b> ${botLink}\n🌐 <b>Website:</b> ${webUrl}`
  },
  {
    id: 3,
    title: "3. Bank Freeze Protection",
    text: `🚨 <b>WORRIED ABOUT BANK ACCOUNT SUSPENSIONS?</b>\n\nP2P Father uses verified buyer checks and encrypted transaction flows to minimize compliance risk and keep your accounts safe.\n\n🛡️ Smart Escrow Protection\n⚡ Clean Payouts\n💬 3-Way Dispute Chat\n\n👉 <b>Start Secure Trades:</b> ${botLink}\n📢 <b>Community:</b> ${groupLink}`
  },
  {
    id: 4,
    title: "4. No-Hassle Escrow Escort",
    text: `👥 <b>TRADING P2P WITHOUT ESCROW IS DANGEROUS!</b>\n\nLet <b>P2P Father</b> act as your trusted automated escrow mediator directly inside Telegram.\n\n• Instant lock upon order placement\n• Auto-release upon confirmation\n• 0% Platform Commission during launch!\n\n🤖 <b>Launch Bot:</b> ${botLink}`
  },

  // --- Category B: Merchants & 0% Fees ---
  {
    id: 5,
    title: "5. P2P Merchant Zero Commission",
    text: `💎 <b>P2P MERCHANTS: STOP PAYING 1% COMMISSIONS!</b> 💎\n\nMaximize your profit margins with <b>P2P Father</b>! 📈\n\n🚀 <b>Merchant Advantages:</b>\n🔸 <b>0% Trading Fees</b> during our launch period!\n🔸 <b>Automated Order Matching & Telegram Mini App</b> UI.\n🔸 <b>Instant Escrow Release</b> via smart contract.\n🔸 <b>High Liquidity & Fast Cash Out</b>.\n\n👇 Create your buy/sell ad in under 60 seconds:\n🤖 <b>Launch Bot:</b> ${botLink}\n🌐 <b>Official Site:</b> ${webUrl}`
  },
  {
    id: 6,
    title: "6. High Volume Arbitrageurs",
    text: `📈 <b>ATTENTION HIGH-VOLUME TRADERS & ARBITRAGEURS!</b>\n\nWhy burn thousands on exchange fees? Trade USDT directly via <b>P2P Father</b> with <b>0% Fees</b> and instant order processing.\n\n⚡ Seamless Mini App Interface\n⚡ Low Latency Order Engine\n⚡ Unlimited Trading Volume\n\n🔗 <b>Trade Now:</b> ${botLink}`
  },
  {
    id: 7,
    title: "7. Zero Fee Promo Hook",
    text: `🎉 <b>LIMITED TIME LAUNCH SPECIAL: 0% FEES!</b>\n\nPay ZERO platform fees on all P2P trades on P2P Father today!\n\n💰 Buy USDT at best market rate\n💰 Sell USDT with instant local cashout\n💰 Keep 100% of your trading profits\n\n👉 <b>Claim 0% Fees:</b> ${botLink}`
  },

  // --- Category C: Instant Local Payments & Fast Cashout ---
  {
    id: 8,
    title: "8. Instant UPI & Bank Transfer (INR)",
    text: `⚡ <b>INSTANT USDT ↔️ INR P2P TRADING ON TELEGRAM</b> ⚡\n\nBuy & Sell USDT instantly using UPI, GPay, PhonePe, IMPS & Bank Transfer!\n\n🔥 <b>P2P Father Highlights:</b>\n✅ <b>0% Platform Fee</b>\n✅ <b>100% Escrow Protection</b>\n✅ <b>Super Fast UPI Payouts</b>\n✅ <b>24/7 Live Dispute Admin Support</b>\n\n📲 <b>Trade USDT on Telegram Now:</b>\n🤖 <b>Bot:</b> ${botLink}\n💬 <b>Group:</b> ${groupLink}`
  },
  {
    id: 9,
    title: "9. Fast 60-Second Cash Out",
    text: `⏱️ <b>NEED CASH IN 60 SECONDS? SELL YOUR CRYPTO ON P2P FATHER!</b>\n\n1. Select your preferred local payment method\n2. Escrow locks crypto instantly\n3. Receive money straight to your bank account!\n\n🚀 Fast, Simple & Secure.\n🤖 <b>Cash Out Now:</b> ${botLink}`
  },
  {
    id: 10,
    title: "10. Global Local Currency Support",
    text: `🌍 <b>TRADE CRYPTO IN YOUR LOCAL CURRENCY ANYTIME!</b>\n\nP2P Father supports multiple fiat currencies with instant payment rails worldwide.\n\n💵 USD | 🇮🇳 INR | 💶 EUR | 💷 GBP & More!\n\n🤖 <b>Start Trading Local:</b> ${botLink}\n🌐 <b>Web App:</b> ${webUrl}`
  },

  // --- Category D: Telegram Mini App & Ease of Use ---
  {
    id: 11,
    title: "11. Telegram Mini App Experience",
    text: `📱 <b>TRADE CRYPTO INSIDE TELEGRAM — NO APP DOWNLOAD NEEDED!</b>\n\nExperience the sleek <b>P2P Father Telegram Mini App</b>. Manage orders, view live charts, and chat with buyers right inside your Telegram app!\n\n✨ Clean UI\n✨ One-Tap Trading\n✨ Instant Notifications\n\n👉 <b>Open Mini App:</b> ${botLink}`
  },
  {
    id: 12,
    title: "12. 24/7 Automated Trading Engine",
    text: `🤖 <b>AUTOMATED 24/7 P2P TRADING BOT</b>\n\nNever miss a trade opportunity. P2P Father automatically matches buy & sell orders round the clock with automated escrow locking.\n\n⚡ 24/7 Uptime\n⚡ Instant Order Execution\n\n🔗 <b>Try Bot:</b> ${botLink}`
  },
  {
    id: 13,
    title: "13. Simple 3-Step Guide",
    text: `💡 <b>HOW TO TRADE ON P2P FATHER IN 3 EASY STEPS:</b>\n\n1️⃣ Open Bot & Select Buy/Sell\n2️⃣ Lock Crypto in Smart Escrow\n3️⃣ Confirm Payment & Receive Funds!\n\nSimple, fast, and 100% secure!\n🤖 <b>Get Started:</b> ${botLink}`
  },

  // --- Category E: Passive Income & Referrals ---
  {
    id: 14,
    title: "14. Earn 20% Lifetime Referral Commission",
    text: `💸 <b>EARN PASSIVE CRYPTO DAILY WITH P2P FATHER!</b> 💸\n\nDid you know you can earn money every time your friends trade crypto? 🤝\n\n🌟 <b>P2P Father Referral Program:</b>\n🎯 Get <b>20% Lifetime Commission</b> on trading fees from everyone you invite!\n🎯 Instant payouts directly to your wallet.\n🎯 Real-time dashboard to track your earnings.\n\n📲 <b>Get your link inside the bot:</b> ${botLink}`
  },
  {
    id: 15,
    title: "15. Influencer & Channel Owner Partner",
    text: `📢 <b>ATTENTION TELEGRAM CHANNEL ADMINS & INFLUENCERS!</b>\n\nMonetize your crypto audience with the highest-paying P2P referral program!\n\n💎 20% Recurring Commission\n💎 Instant Crypto Payouts\n💎 Custom Marketing Banners Provided\n\n🤝 <b>Join Partner Program:</b> ${botLink}`
  },
  {
    id: 16,
    title: "16. Affiliate Cash Machine",
    text: `🔥 <b>TURN YOUR TELEGRAM FRIENDS INTO PASSIVE INCOME!</b>\n\nShare your P2P Father referral link in groups & channels. Earn crypto automatically whenever they trade!\n\n💰 Lifetime Passive Income\n💰 Automated Commission Tracking\n\n👉 <b>Grab Your Referral Link:</b> ${botLink}`
  },

  // --- Category F: Short & Viral Shilling ---
  {
    id: 17,
    title: "17. Short & Punchy Hype",
    text: `👑 <b>P2P FATHER IS HERE!</b> 🚀\n\nThe fastest, safest Telegram P2P Crypto Exchange.\n\n🔹 <b>0% Fees</b>\n🔹 <b>Automated Escrow</b>\n🔹 <b>Instant Payouts</b>\n🔹 <b>Telegram Mini App</b>\n\n🤖 <b>Bot:</b> ${botLink}\n🌐 <b>Web:</b> ${webUrl}`
  },
  {
    id: 18,
    title: "18. Quick Alert Pitch",
    text: `🚨 <b>NEW P2P EXCHANGE LAUNCHED ON TELEGRAM!</b>\n\nSwap USDT to Fiat with 0% Fees & Smart Contract Escrow!\n\n👉 <b>Trade Now:</b> ${botLink}\n💬 <b>Group:</b> ${groupLink}`
  },
  {
    id: 19,
    title: "19. One-Liner Shiller",
    text: `⚡ Trade USDT on Telegram with 0% Fees & Smart Escrow! Check out P2P Father 👉 ${botLink}`
  },
  {
    id: 20,
    title: "20. Emoji Express Promo",
    text: `🔥 <b>P2P FATHER</b> 🔥\n\n💰 Buy & Sell USDT\n🔒 100% Smart Escrow\n⚡ 0% Launch Fees\n⏱️ Instant Local Payouts\n\n🤖 <b>Start:</b> ${botLink}`
  },

  // --- Category G: Community & Launch Promo ---
  {
    id: 21,
    title: "21. Official Community Welcome",
    text: `👋 <b>WELCOME TO THE OFFICIAL P2P FATHER COMMUNITY!</b>\n\nJoin thousands of smart traders using P2P Father for fast, safe, and zero-fee P2P crypto trades.\n\n📢 Updates: ${groupLink}\n🤖 Bot: ${botLink}\n🌐 Web: ${webUrl}`
  },
  {
    id: 22,
    title: "22. Launch Giveaway / Reward Callout",
    text: `🎁 <b>LAUNCH GIVEAWAY & 0% FEE PROMO IS LIVE!</b>\n\nTrade on P2P Father today to qualify for our launch rewards and fee-free trading period!\n\n🚀 0% Trading Fees\n🚀 Instant Escrow\n🚀 Referral Cash Bonuses\n\n👉 <b>Claim Your Bonus:</b> ${botLink}`
  }
];

async function postAndPinAll() {
  console.log(`🚀 Posting and pinning ${variants.length} variants to chat: ${targetGroupId}...`);
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    try {
      console.log(`\n📤 Posting [${v.title}]...`);
      const sentMsg = await bot.api.sendMessage(targetGroupId, v.text, { parse_mode: "HTML" });
      console.log(`✅ Posted message ID: ${sentMsg.message_id}`);
      
      console.log(`📌 Pinning message ID: ${sentMsg.message_id}...`);
      await bot.api.pinChatMessage(targetGroupId, sentMsg.message_id, { disable_notification: false });
      console.log(`📌 Pinned successfully!`);

      // 1.5s delay to prevent Telegram rate limit
      await new Promise((res) => setTimeout(res, 1500));
    } catch (err) {
      console.error(`❌ Error posting ${v.title}:`, err.message);
    }
  }
  console.log("\n🎉 Finished posting and pinning all variants!");
}

postAndPinAll();
