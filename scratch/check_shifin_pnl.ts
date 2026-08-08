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
    const proxyAddress = '0xaBa1148A1723b18c4D1836AC18F37819654a83f0';
    console.log("Fetching positions from Polymarket for Shifin's proxy:", proxyAddress);
    
    const allPositions = await polymarketService.getPositionsForProxy(proxyAddress, "0").catch((err) => {
        console.error("Error fetching positions:", err);
        return [];
    });
    console.log(`Polymarket returned ${allPositions.length} positions.`);
    
    let totalCashPnl = 0;
    let totalCurrentValue = 0;
    let netPnL = 0;
    let totalInvested = 0;

    for (const p of allPositions) {
        const size = parseFloat(p.size);
        const cashPnl = parseFloat(p.cashPnl ?? '0');
        totalCashPnl += cashPnl;
        
        // Invested amount is size * avgPrice (which is usually size * avgBuyPrice)
        // Let's check what average price fields exist in the position object
        const avgPrice = parseFloat(p.avgPrice ?? p.avgBuyPrice ?? '0.5');
        const invested = size * avgPrice;
        totalInvested += invested;

        // Resolve condition on-chain
        const res = await getConditionResolution(p.conditionId);
        let value = 0;
        let outcomeStr = "OPEN";
        let fraction = 0;

        if (res) {
            const outcomeIndex = p.outcomeIndex !== undefined ? parseInt(p.outcomeIndex) : 0; 
            const num = outcomeIndex === 0 ? res.num0 : res.num1;
            fraction = num / res.denominator;
            value = size * fraction;
            outcomeStr = fraction === 1 ? "WIN" : fraction === 0 ? "LOSS" : `RESOLVED (${fraction})`;
        } else {
            const currentPrice = parseFloat(p.curPrice ?? '0.5');
            value = size * currentPrice;
            outcomeStr = `OPEN ($${currentPrice.toFixed(2)})`;
        }

        const positionPnl = cashPnl + value;
        netPnL += positionPnl;
        totalCurrentValue += value;

        console.log(`Asset: ${p.title || p.asset} | Size: ${size.toFixed(2)} | AvgPrice: $${avgPrice.toFixed(2)} | Invested: $${invested.toFixed(2)} | Cash PnL: $${cashPnl.toFixed(2)} | Current Value: $${value.toFixed(2)} (${outcomeStr}) | Position Net PnL: $${positionPnl.toFixed(2)}`);
    }

    console.log("\n=== Shifin Polymarket UI PnL Calculation ===");
    console.log(`Total Invested Amount: $${totalInvested.toFixed(2)}`);
    console.log(`Total Cash PnL (Realized PnL from trades): $${totalCashPnl.toFixed(2)}`);
    console.log(`Total Current Positions Value (Unrealized Value): $${totalCurrentValue.toFixed(2)}`);
    console.log(`Total PnL (Realized + Unrealized): $${netPnL.toFixed(2)}`);
}

run();
