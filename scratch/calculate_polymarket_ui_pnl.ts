import { config } from "dotenv";
config();
import { polymarketService } from "../src/services/polymarket";
import { ethers } from "ethers";

const CTF_ADDRESS = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
const CTF_ABI = [
    'function payoutDenominator(bytes32) view returns (uint256)',
    'function payoutNumerators(bytes32, uint256) view returns (uint256)',
];

async function getConditionResolution(conditionId: string): Promise<{ num0: number; num1: number; denominator: number } | null> {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com');
        const ctf = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);
        const denominator = await ctf.payoutDenominator(conditionId);
        if (BigInt(denominator) === 0n) return null; // Not resolved yet
        const [num0, num1] = await Promise.all([
            ctf.payoutNumerators(conditionId, 0),
            ctf.payoutNumerators(conditionId, 1),
        ]);
        return {
            num0: Number(num0),
            num1: Number(num1),
            denominator: Number(denominator),
        };
    } catch {
        return null;
    }
}

async function run() {
    const proxyAddress = '0xbd1d8a2E7D15E2e777524F06d58b5b4709579C02';
    console.log("Fetching positions from Polymarket for proxy:", proxyAddress);
    
    const allPositions = await polymarketService.getPositionsForProxy(proxyAddress, "0").catch(() => []);
    console.log(`Polymarket returned ${allPositions.length} positions.`);
    
    let totalCashPnl = 0;
    let totalCurrentValue = 0;
    let netPnL = 0;

    for (const p of allPositions) {
        const size = parseFloat(p.size);
        const cashPnl = parseFloat(p.cashPnl ?? '0');
        totalCashPnl += cashPnl;

        // Resolve condition on-chain
        const res = await getConditionResolution(p.conditionId);
        let value = 0;
        let outcomeStr = "OPEN";
        let fraction = 0;

        if (res) {
            // Find which outcome index this position is for
            // Polymarket Data API positions have outcomeIndex or asset representing the token
            // Normally, YES token is outcomeIndex 0, NO token is outcomeIndex 1
            // Let's check outcomeIndex or match from asset ID
            const outcomeIndex = p.outcomeIndex !== undefined ? parseInt(p.outcomeIndex) : 0; 
            const num = outcomeIndex === 0 ? res.num0 : res.num1;
            fraction = num / res.denominator;
            value = size * fraction;
            outcomeStr = fraction === 1 ? "WIN" : fraction === 0 ? "LOSS" : `RESOLVED (${fraction})`;
        } else {
            // Open position: value at current market price (buyPrice)
            const currentPrice = parseFloat(p.curPrice ?? '0.5');
            value = size * currentPrice;
            outcomeStr = `OPEN ($${currentPrice.toFixed(2)})`;
        }

        const positionPnl = cashPnl + value;
        netPnL += positionPnl;
        totalCurrentValue += value;

        console.log(`Asset: ${p.title || p.asset} | Size: ${size.toFixed(2)} | Cash PnL: $${cashPnl.toFixed(2)} | Current Value: $${value.toFixed(2)} (${outcomeStr}) | Position Net PnL: $${positionPnl.toFixed(2)}`);
    }

    console.log("\n=== Polymarket UI PnL Calculation ===");
    console.log(`Total Cash PnL: $${totalCashPnl.toFixed(2)}`);
    console.log(`Total Current Positions Value: $${totalCurrentValue.toFixed(2)}`);
    console.log(`Polymarket UI Realized + Unrealized PnL: $${netPnL.toFixed(2)}`);
}

run();
