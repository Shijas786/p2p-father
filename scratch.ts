import fetch from 'node-fetch';

async function test() {
    const address = "0x69f0c154a3412f2b3fa7eb22c6d08e6b5b32fb27";
    const [tradesRes, positionsRes] = await Promise.all([
        fetch(`https://data-api.polymarket.com/trades?user=${address}&limit=500`).then(r => r.json()).catch(() => []),
        fetch(`https://data-api.polymarket.com/positions?user=${address}`).then(r => r.json()).catch(() => [])
    ]);

    const positionMap: Record<string, any> = {};

    for (const trade of (Array.isArray(tradesRes) ? tradesRes : [])) {
        const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
        const key = tradeAssetLc;
        
        const qty = parseFloat(trade.size ?? "0");
        const price = parseFloat(trade.price ?? "0");
        const isSell = trade.side === "SELL";

        if (!positionMap[key]) {
            positionMap[key] = {
                outcome: trade.outcomeIndex === 0 ? 'UP' : 'DOWN',
                asset: tradeAssetLc,
                title: trade.title,
                qty: 0,
                totalCost: 0,
                avgPrice: 0,
                currentPrice: parseFloat(trade.price ?? "0"),
            };
        }

        if (isSell) {
            const currentAvg = positionMap[key].qty > 0 ? (positionMap[key].totalCost / positionMap[key].qty) : 0;
            positionMap[key].qty -= qty;
            positionMap[key].totalCost -= qty * currentAvg;
        } else {
            positionMap[key].qty += qty;
            positionMap[key].totalCost += qty * price;
        }
    }

    for (const key of Object.keys(positionMap)) {
        const activePos = (Array.isArray(positionsRes) ? positionsRes : []).find((p: any) => (p.asset || "").toLowerCase() === positionMap[key].asset);
        
        if (positionMap[key].qty > 0) {
            positionMap[key].avgPrice = positionMap[key].totalCost / positionMap[key].qty;
        }

        if (activePos && parseFloat(activePos.size) > 0 && !activePos.redeemable) {
            const syncedQty = parseFloat(activePos.size);
            
            if (activePos.initialValue !== undefined) {
                const initialValue = parseFloat(activePos.initialValue);
                positionMap[key].qty = syncedQty;
                positionMap[key].totalCost = initialValue;
                positionMap[key].avgPrice = initialValue / syncedQty;
            } else {
                const oldQty = positionMap[key].qty;
                if (oldQty > 0 && syncedQty !== oldQty) {
                    positionMap[key].totalCost = (positionMap[key].totalCost / oldQty) * syncedQty;
                }
                positionMap[key].qty = syncedQty;
                positionMap[key].avgPrice = positionMap[key].qty > 0
                    ? positionMap[key].totalCost / positionMap[key].qty
                    : 0;
            }
        } else {
            positionMap[key].qty = 0;
        }
    }

    const positions = Object.keys(positionMap).map(key => {
        const p = positionMap[key];
        const value = p.qty * p.currentPrice;
        return {
            title: p.title,
            qty: p.qty,
            avg: p.avgPrice,
            cost: p.totalCost,
            value: value,
            returnAmt: value - p.totalCost
        };
    }).filter(p => p.qty > 0);

    console.log(JSON.stringify(positions, null, 2));
}

test();
