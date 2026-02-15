
import axios from 'axios';

async function main() {
    console.log("Testing Order Creation Bypass...");

    const url = 'http://127.0.0.1:3000/api/miniapp/orders';
    const payload = {
        type: 'sell',
        token: 'USDC',
        amount: 1,
        rate: 88,
        payment_methods: ['UPI'],
        chain: 'base'
    };

    try {
        // No init-data header -> triggers dev bypass if enabled
        const res = await axios.post(url, payload);
        console.log("Response Status:", res.status);
        console.log("Response Data:", res.data);

        if (res.status === 200 && res.data.order) {
            console.log("❌ BUG CONFIRMED: Order created successfully without funds!");
        }
    } catch (err: any) {
        if (err.response) {
            console.log("Response Status:", err.response.status);
            console.log("Response Data:", err.response.data);
            if (err.response.status === 400) {
                console.log("✅ CHECK PASSED: Server rejected order (Insufficient Balance).");
            }
        } else {
            console.error("Request failed:", err.message);
        }
    }
}

main();
