const trades = [
    { side: "BUY", size: "100", price: "0.1" },
    { side: "SELL", size: "50", price: "0.9" }
];
let qty = 0;
let totalCost = 0;
let avgPrice = 0;

for (const trade of trades) {
    const tradeQty = parseFloat(trade.size);
    const price = parseFloat(trade.price);
    const isSell = trade.side === "SELL";
    if (isSell) {
        qty -= tradeQty;
        totalCost -= tradeQty * price;
    } else {
        qty += tradeQty;
        totalCost += tradeQty * price;
    }
}
if (qty > 0) {
    avgPrice = totalCost / qty;
}
console.log({ qty, totalCost, avgPrice });
