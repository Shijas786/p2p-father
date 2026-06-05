const fs = require('fs');
let code = fs.readFileSync('src/api/miniapp.ts', 'utf8');

const targetStr = `            // Aggregate open positions from recent trades
            const positionMap: Record<string, { outcome: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null }> = {};
            const yesTokenIdLc = market.yesTokenId.toLowerCase();
            const noTokenIdLc = market.noTokenId.toLowerCase();

            for (const trade of (tradesRes || [])) {
                const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
                const isUp = tradeAssetLc === yesTokenIdLc;
                const isDown = tradeAssetLc === noTokenIdLc;
                if (!isUp && !isDown) continue;

                const key = isUp ? "UP" : "DOWN";
                const qty = parseFloat(trade.size ?? "0");
                const price = parseFloat(trade.price ?? "0");
                const isSell = trade.side === "SELL";

                if (!positionMap[key]) {
                    positionMap[key] = {
                        outcome: key,
                        qty: 0,
                        totalCost: 0,
                        avgPrice: 0,
                        currentPrice: isUp ? yesPrice?.buyPrice ?? null : noPrice?.buyPrice ?? null,
                    };
                }

                if (isSell) {
                    positionMap[key].qty -= qty;
                    positionMap[key].totalCost -= qty * price;
                } else {
                    positionMap[key].qty += qty;
                    positionMap[key].totalCost += qty * price;
                }
            }`;

const replacementStr = `            // Aggregate open positions from recent trades
            const positionMap: Record<string, { outcome: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null }> = {};
            const yesTokenIdLc = market.yesTokenId.toLowerCase();
            const noTokenIdLc = market.noTokenId.toLowerCase();

            let activeRealizedPnl = 0;
            const sortedTrades = [...(tradesRes || [])].reverse(); // Oldest first for accurate avg price calculation

            for (const trade of sortedTrades) {
                const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
                const isUp = tradeAssetLc === yesTokenIdLc;
                const isDown = tradeAssetLc === noTokenIdLc;
                if (!isUp && !isDown) continue;

                const key = isUp ? "UP" : "DOWN";
                const qty = parseFloat(trade.size ?? "0");
                const price = parseFloat(trade.price ?? "0");
                const isSell = trade.side === "SELL";

                if (!positionMap[key]) {
                    positionMap[key] = {
                        outcome: key,
                        qty: 0,
                        totalCost: 0,
                        avgPrice: 0,
                        currentPrice: isUp ? yesPrice?.buyPrice ?? null : noPrice?.buyPrice ?? null,
                    };
                }

                if (isSell) {
                    const avgEntryPrice = positionMap[key].qty > 0 ? positionMap[key].totalCost / positionMap[key].qty : 0;
                    activeRealizedPnl += (price - avgEntryPrice) * qty;
                    positionMap[key].qty -= qty;
                    positionMap[key].totalCost -= avgEntryPrice * qty;
                } else {
                    positionMap[key].qty += qty;
                    positionMap[key].totalCost += qty * price;
                }
            }`;

if (code.includes(targetStr)) {
    code = code.replace(targetStr, replacementStr);
    console.log("Replaced block 1");
} else {
    console.log("Could not find block 1");
}

const target2 = `            let realizedPnl = 0;
            try {
                // Step 1: Try Data API cashPnl first (works for recently resolved ones still in API)`;

const replacement2 = `            let realizedPnl = activeRealizedPnl; // Include partial sells from active market
            try {
                // Step 1: Try Data API cashPnl first (works for recently resolved ones still in API)`;

if (code.includes(target2)) {
    code = code.replace(target2, replacement2);
    console.log("Replaced block 2");
} else {
    console.log("Could not find block 2");
}

fs.writeFileSync('src/api/miniapp.ts', code);
