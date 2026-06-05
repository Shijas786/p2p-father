const trades = [
    { side: "BUY", size: "100", price: "0.1" },
    { side: "SELL", size: "50", price: "0.9" }
];
let qty = 0;
let totalCost = 0;
let realizedPnl = 0;

for (const trade of trades) {
    const tradeQty = parseFloat(trade.size);
    const price = parseFloat(trade.price);
    const isSell = trade.side === "SELL";
    if (isSell) {
        const avgEntryPrice = qty > 0 ? totalCost / qty : 0;
        realizedPnl += (price - avgEntryPrice) * tradeQty;
        qty -= tradeQty;
        totalCost -= avgEntryPrice * tradeQty;
    } else {
        qty += tradeQty;
        totalCost += tradeQty * price;
    }
}
const avgPrice = qty > 0 ? totalCost / qty : 0;
console.log({ qty, totalCost, avgPrice, realizedPnl });
