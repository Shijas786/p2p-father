import { broadcastAd } from "../src/bot/index";

async function run() {
    const dummyOrder = {
        id: "c884347d-bdcb-4af3-aea5-c130c2f3ebc9",
        user_id: "some-user-id",
        type: "sell",
        token: "USDC",
        chain: "base",
        amount: 100,
        rate: 90,
        fiat_currency: "INR",
        payment_methods: ["UPI"],
        payment_details: {
            note: "fast please"
        }
    };
    const dummyUser = {
        id: "some-user-id",
        username: "shijas",
        trust_score: 98
    };

    try {
        console.log("Simulating Mini App ad creation broadcast...");
        await broadcastAd(dummyOrder, dummyUser);
        console.log("Done!");
    } catch (err) {
        console.error("Failed:", err);
    }
}
run();
