import axios from "axios";

async function testDoH(hostname: string) {
    try {
        console.log(`\nTesting ${hostname} with Cloudflare...`);
        const res = await axios.get(`https://cloudflare-dns.com/dns-query`, {
            params: { name: hostname, type: "A" },
            headers: { Accept: "application/dns-json" },
        });
        const answers = res.data?.Answer ?? [];
        console.log("[DoH Debug]", hostname, JSON.stringify(answers, null, 2));

        const aRecords = answers.filter((a: any) => a.type === 1);
        if (!aRecords.length) {
            console.log(`No A record found on Cloudflare, trying Google...`);
            const gRes = await axios.get(`https://dns.google/resolve`, {
                params: { name: hostname, type: "A" },
            });
            const gAnswers = gRes.data?.Answer ?? [];
            console.log("[DoH Google Debug]", hostname, JSON.stringify(gAnswers, null, 2));
            const gARecords = gAnswers.filter((a: any) => a.type === 1);
            if (!gARecords.length) {
                console.log(`No A record for ${hostname} on Google either.`);
            } else {
                console.log(`Found IP (Google):`, gARecords[gARecords.length - 1].data);
            }
        } else {
            console.log(`Found IP (Cloudflare):`, aRecords[aRecords.length - 1].data);
        }
    } catch (e: any) {
        console.error(`Error resolving ${hostname}:`, e.message);
    }
}

async function run() {
    await testDoH("data-api.polymarket.com");
    await testDoH("gamma-api.polymarket.com");
}

run();
