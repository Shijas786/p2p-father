import https from 'https';
import axios from 'axios';

async function resolveDoH(hostname: string): Promise<string> {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`, {
        headers: { 'accept': 'application/dns-json' }
    });
    const data = await res.json();
    return data.Answer[0].data;
}

const customLookup = async (hostname: string, options: any, callback: any) => {
    try {
        if (hostname.includes('polymarket.com')) {
            const ip = await resolveDoH(hostname);
            callback(null, ip, 4);
            return;
        }
        import('dns').then(dns => dns.lookup(hostname, options, callback));
    } catch (e) {
        import('dns').then(dns => dns.lookup(hostname, options, callback));
    }
};

const agent = new https.Agent({ lookup: customLookup as any });

async function run() {
    try {
        const res = await axios.get('https://data-api.polymarket.com/trades?user=0x1', { httpsAgent: agent, timeout: 5000 });
        console.log("SUCCESS:", res.data);
    } catch (e: any) {
        console.log("FAILED:", e.message);
    }
}
run();
