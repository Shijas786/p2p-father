import { bot } from '../src/bot/index'; // This imports the bot instance
import { formatOrder } from '../src/utils/formatters';

const gorillaOrder = {
    id: "38b0ebaa-1234-5678-90ab-cdef12345678",
    user_id: "e49657c1",
    type: "buy",
    token: "USDC",
    chain: "base",
    amount: 10,
    rate: 90,
    fiat_currency: "INR",
    payment_methods: ["UPI"],
    filled_amount: 0,
    username: "gorilla_m1",
    trust_score: 100
};

async function main() {
    const chatId = 5626923173; // The user ID we found earlier
    const text = formatOrder(gorillaOrder as any);

    console.log("Sending test message to:", chatId);
    console.log(text);

    try {
        await bot.api.sendMessage(chatId, text, { parse_mode: "Markdown" });
        console.log("✅ Message sent successfully!");
    } catch (err: any) {
        console.error("❌ Failed to send message:", err.description || err.message);
    }
}

main().catch(console.error);
