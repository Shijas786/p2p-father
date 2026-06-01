import * as dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.BSCSCAN_API_KEY;
const contractAddress = "0x74edAcd5FefFe2fb59b7b0942Ed99e49A3AB853a";

// Deposit event topic0: keccak256("Deposit(address,address,uint256)")
const depositTopic = "0x5548c837ab068cf56a2c2479df0882a4922fd203edb7517321831d95078c5f62";
// Withdraw event topic0: keccak256("Withdraw(address,address,uint256)")
const withdrawTopic = "0xf279e6a1f5e320cca91135676d9cb6e44ca8a08c0b88342bcdb1144f6511b568";

async function fetchLogs() {
    console.log("Fetching Deposit logs from BscScan API...");
    const depositUrl = `https://api.bscscan.com/api?module=logs&action=getLogs&address=${contractAddress}&topic0=${depositTopic}&apikey=${apiKey}`;
    
    const dRes = await fetch(depositUrl);
    const dJson = await dRes.json();

    if (dJson.status !== "1") {
        console.log("Error fetching deposits:", dJson);
        return;
    }

    console.log(`Found ${dJson.result.length} Deposit events.`);
    
    console.log("Fetching Withdraw logs from BscScan API...");
    const withdrawUrl = `https://api.bscscan.com/api?module=logs&action=getLogs&address=${contractAddress}&topic0=${withdrawTopic}&apikey=${apiKey}`;
    
    const wRes = await fetch(withdrawUrl);
    const wJson = await wRes.json();

    const deposits = dJson.result;
    const withdraws = wJson.status === "1" ? wJson.result : [];

    console.log(`Found ${withdraws.length} Withdraw events.`);

    const userBalances = new Map<string, { usdc: bigint, usdt: bigint, bnb: bigint }>();

    const BSC_USDC = "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d";
    const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";
    const BSC_BNB = "0x0000000000000000000000000000000000000000";

    const processLog = (log: any, isDeposit: boolean) => {
        // topic1 is user, topic2 is token
        const user = "0x" + log.topics[1].slice(26).toLowerCase();
        const token = "0x" + log.topics[2].slice(26).toLowerCase();
        // data is amount
        const amount = BigInt(log.data);

        if (!userBalances.has(user)) {
            userBalances.set(user, { usdc: 0n, usdt: 0n, bnb: 0n });
        }

        const bal = userBalances.get(user)!;
        
        const sign = isDeposit ? 1n : -1n;

        if (token === BSC_USDC) bal.usdc += amount * sign;
        else if (token === BSC_USDT) bal.usdt += amount * sign;
        else if (token === BSC_BNB) bal.bnb += amount * sign;
    };

    deposits.forEach((log: any) => processLog(log, true));
    withdraws.forEach((log: any) => processLog(log, false));

    console.log("\n=================================");
    console.log("USERS WITH STUCK VAULT FUNDS");
    console.log("=================================");
    for (const [user, bal] of userBalances.entries()) {
        if (bal.usdc > 0n || bal.usdt > 0n || bal.bnb > 0n) {
            console.log(`User: ${user}`);
            if (bal.usdc > 0n) console.log(`  USDC: ${Number(bal.usdc) / 1e18}`);
            if (bal.usdt > 0n) console.log(`  USDT: ${Number(bal.usdt) / 1e18}`);
            if (bal.bnb > 0n) console.log(`  BNB: ${Number(bal.bnb) / 1e18}`);
        }
    }
}

fetchLogs().catch(console.error);
