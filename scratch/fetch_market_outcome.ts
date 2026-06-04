import axios from "axios";

async function checkMarket(slug: string) {
    try {
        console.log(`Checking slug: ${slug}`);
        const res = await axios.get(`https://gamma-api.polymarket.com/events`, {
            params: { slug },
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            }
        });
        const events = res.data || [];
        if (events && events.length > 0) {
            const event = events[0];
            console.log(`Event Title: ${event.title}`);
            if (event.markets && event.markets.length > 0) {
                const market = event.markets[0];
                console.log(`  Market Question: ${market.question}`);
                console.log(`  Slug: ${market.slug}`);
                console.log(`  Resolved: ${market.resolved}`);
                console.log(`  Outcome: ${market.outcome}`);
                console.log(`  Resolved Outcome Index: ${market.resolvedOutcomeIndex}`);
                console.log(`  Outcomes (choices):`, market.outcomes);
                return true;
            }
        } else {
            console.log(`No event found for slug ${slug}`);
        }
    } catch (err: any) {
        console.error(`Error checking slug ${slug}:`, err.message);
    }
    return false;
}

async function main() {
    // Let's check both potential timezones:
    // Case 1: User's local timezone (IST, +5:30)
    // Jun 3 17:35 IST -> Jun 3 12:05 UTC -> 1780497900
    const tsIST = Math.floor(new Date("2026-06-03T12:05:00.000Z").getTime() / 1000);
    const slugIST = `btc-updown-5m-${tsIST}`;
    await checkMarket(slugIST);

    // Case 2: UTC timezone
    // Jun 3 17:35 UTC -> 1780517700
    const tsUTC = Math.floor(new Date("2026-06-03T17:35:00.000Z").getTime() / 1000);
    const slugUTC = `btc-updown-5m-${tsUTC}`;
    await checkMarket(slugUTC);

    // Case 3: Let's query by search term
    console.log("\nSearching for events matching 'btc-updown-5m'...");
    try {
        const res = await axios.get("https://gamma-api.polymarket.com/events", {
            params: { 
                query: "Bitcoin Up or Down",
                limit: 20
            },
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            }
        });
        const events = res.data || [];
        console.log(`Found ${events.length} search results:`);
        for (const event of events) {
            if (event.title.includes("Jun 3")) {
                console.log(`- Title: ${event.title}, Slug: ${event.slug}`);
                if (event.markets && event.markets.length > 0) {
                    const m = event.markets[0];
                    console.log(`  Resolved Outcome: ${m.outcome} (resolvedOutcomeIndex: ${m.resolvedOutcomeIndex}, outcomes: ${JSON.stringify(m.outcomes)})`);
                }
            }
        }
    } catch (err: any) {
        console.error("Search error:", err.message);
    }
}

main().catch(console.error);
