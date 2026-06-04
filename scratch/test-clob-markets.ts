import axios from "axios";
async function run() {
    try {
        const res = await axios.get("https://clob.polymarket.com/markets?active=true");
        const markets = res.data?.data || res.data || [];
        const targetMarket = markets.find((m: any) => 
            m.active && !m.closed && m.tokens && m.tokens.length >= 2 && 
            (m.question.includes("Bitcoin") || m.question.includes("BTC"))
        );
        console.log(targetMarket ? "FOUND: " + targetMarket.question : "NOT FOUND");
    } catch(e) { console.error(e.message); }
}
run();
