import { db } from "../src/db/client";
import { polymarketRelayerService } from "../src/services/relayer";
import { polymarketService } from "../src/services/polymarket";
import { redis } from "../src/services/redis";
import { ethers } from "ethers";

const TG_ID = 123456789; // Shijas

// Define same helper from miniapp.ts
const polygonProvider = new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com', 137, { staticNetwork: true });

const ctfContractShared = new ethers.Contract(
    '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
    [
        'function payoutDenominator(bytes32) view returns (uint256)',
        'function payoutNumerators(bytes32, uint256) view returns (uint256)'
    ],
    polygonProvider
);

const conditionResolutionCache = new Map<string, { denominator: number, num0: number, num1: number }>();

async function getConditionResolution(cid: string): Promise<{ denominator: number, num0: number, num1: number } | null> {
    const cacheKey = cid.toLowerCase();
    let resolution = conditionResolutionCache.get(cacheKey);
    if (resolution) return resolution;

    try {
        const cached = await redis.get(`resolution:${cacheKey}`);
        if (cached) {
            resolution = JSON.parse(cached);
            if (resolution) {
                conditionResolutionCache.set(cacheKey, resolution);
                return resolution;
            }
        }
    } catch {}

    try {
        const denominator = await ctfContractShared.payoutDenominator(cid as `0x${string}`).catch(() => 0n);
        if (denominator > 0n) {
            const [num0, num1] = await Promise.all([
                ctfContractShared.payoutNumerators(cid as `0x${string}`, 0n).catch(() => 0n),
                ctfContractShared.payoutNumerators(cid as `0x${string}`, 1n).catch(() => 0n)
            ]);
            resolution = {
                denominator: Number(denominator),
                num0: Number(num0),
                num1: Number(num1)
            };
            conditionResolutionCache.set(cacheKey, resolution);
            try {
                await redis.set(`resolution:${cacheKey}`, JSON.stringify(resolution));
            } catch {}
            return resolution;
        }
    } catch {}
    return null;
}

async function main() {
    const user = await db.getUserByTelegramId(TG_ID);
    if (!user) {
        console.error("User not found");
        return;
    }

    const proxyAddress = await polymarketRelayerService.resolveDepositWallet(user.wallet_index, (user as any).deposit_wallet_address);
    console.log("Resolved Proxy Address:", proxyAddress);

    // Resolve active market first
    const market = await polymarketService.getActiveBtcMarket().catch(() => null);
    console.log("Active Market:", market?.slug);

    // Fetch in parallel
    const [balanceRes, tradesRes, positionsRes, historyRes, yesPriceRes, noPriceRes] = await Promise.allSettled([
        polymarketRelayerService.getPusdBalance(user.wallet_index),
        polymarketService.getTradesForProxy(proxyAddress),
        polymarketService.getPositionsForProxy(proxyAddress).catch(() => []),
        fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=100").then(r => r.json()).catch(() => []),
        market ? polymarketService.getOutcomePrice(market.yesTokenId, false) : Promise.resolve({ buyPrice: 0.5, sellPrice: 0.5 }),
        market ? polymarketService.getOutcomePrice(market.noTokenId, true) : Promise.resolve({ buyPrice: 0.5, sellPrice: 0.5 })
    ]);

    const balance = balanceRes.status === 'fulfilled' ? balanceRes.value : "0.00";
    const rawTrades = tradesRes.status === 'fulfilled' ? tradesRes.value : [];
    const positionsData = positionsRes.status === 'fulfilled' ? positionsRes.value : [];
    const yesPrice = yesPriceRes.status === 'fulfilled' ? yesPriceRes.value : { buyPrice: 0.5, sellPrice: 0.5 };
    const noPrice = noPriceRes.status === 'fulfilled' ? noPriceRes.value : { buyPrice: 0.5, sellPrice: 0.5 };

    console.log("Snapshot Balance:", balance);
    console.log("Raw Trades length:", rawTrades.length);
    console.log("Positions Data length:", positionsData.length);

    // Process positions
    const yesTokenIdLc = market ? market.yesTokenId.toLowerCase() : "";
    const noTokenIdLc = market ? market.noTokenId.toLowerCase() : "";

    const positionMap: Record<string, { outcome: string; asset: string; title?: string; qty: number; totalCost: number; avgPrice: number; currentPrice: number | null }> = {};
    let activeRealizedPnl = 0;
    const sortedTrades = [...(rawTrades || [])].reverse();

    for (const trade of sortedTrades) {
        const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
        const isUp = market ? tradeAssetLc === yesTokenIdLc : false;
        const isDown = market ? tradeAssetLc === noTokenIdLc : false;
        if (!isUp && !isDown) continue;

        const key = isUp ? "UP" : "DOWN";
        const qty = parseFloat(trade.size ?? "0");
        const price = parseFloat(trade.price ?? "0");
        const isSell = trade.side === "SELL";

        if (!positionMap[key]) {
            positionMap[key] = {
                outcome: isUp ? 'UP' : 'DOWN',
                asset: tradeAssetLc,
                title: trade.title,
                qty: 0,
                totalCost: 0,
                avgPrice: 0,
                currentPrice: isUp ? yesPrice?.buyPrice ?? null : (isDown ? noPrice?.buyPrice ?? null : parseFloat(trade.price ?? "0")),
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
    }

    // Sync qty with Data API
    for (const key of Object.keys(positionMap)) {
        if (!market) continue;
        const tokenIdLc = key === "UP" ? yesTokenIdLc : noTokenIdLc;
        const activePos = positionsData.find((p: any) => (p.asset || "").toLowerCase() === tokenIdLc);

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
                positionMap[key].avgPrice = positionMap[key].qty > 0 ? positionMap[key].totalCost / positionMap[key].qty : 0;
            }
        } else if (activePos && activePos.redeemable) {
            positionMap[key].qty = 0;
        } else if (!activePos) {
            // Keep trade loop values
        } else {
            positionMap[key].qty = 0;
        }
    }

    // Fallback: Ensure any active positions from Polymarket positionsData are added even if not present in positionMap
    for (const p of positionsData) {
        if (!market) continue;
        const assetLc = (p.asset || "").toLowerCase();
        const isYes = assetLc === yesTokenIdLc;
        const isNo = assetLc === noTokenIdLc;
        if (!isYes && !isNo) continue;

        const key = isYes ? "UP" : "DOWN";
        const syncedQty = parseFloat(p.size || "0");
        if (syncedQty > 0.001 && !p.redeemable) {
            if (!positionMap[key]) {
                const initialValue = p.initialValue !== undefined ? parseFloat(p.initialValue) : 0;
                positionMap[key] = {
                    outcome: isYes ? 'UP' : 'DOWN',
                    asset: assetLc,
                    title: p.title || (isYes ? "Bitcoin Price > Strike" : "Bitcoin Price <= Strike"),
                    qty: syncedQty,
                    totalCost: initialValue,
                    avgPrice: syncedQty > 0 ? initialValue / syncedQty : 0,
                    currentPrice: isYes ? yesPrice?.buyPrice ?? null : (isNo ? noPrice?.buyPrice ?? null : null),
                };
            }
        }
    }

    const positions = Object.values(positionMap)
        .filter(p => p.qty > 0.001)
        .map(p => {
            const effectivePrice = p.currentPrice ?? p.avgPrice;
            const value = p.qty * effectivePrice;
            const cost = p.qty * p.avgPrice;
            const returnAmt = value - cost;
            const returnPct = cost > 0 ? (returnAmt / cost) * 100 : 0;
            return {
                outcome: p.outcome,
                qty: parseFloat(p.qty.toFixed(2)),
                avg: parseFloat(p.avgPrice.toFixed(2)),
                currentPrice: parseFloat(effectivePrice.toFixed(2)),
                value: parseFloat(value.toFixed(2)),
                cost: parseFloat(cost.toFixed(2)),
                returnAmt: parseFloat(returnAmt.toFixed(2)),
                returnPct: parseFloat(returnPct.toFixed(2)),
                title: p.title,
            };
        });

    console.log("Processed Positions returned to UI:", JSON.stringify(positions, null, 2));
}

main().catch(console.error);
