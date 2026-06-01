# Polymarket "Predict" Mini-App Implementation Guide

This document records the exact logic, math, and architecture required to build the 5-minute Polymarket BTC prediction interface. If the `Predict.tsx` file is ever lost or needs to be rebuilt, this guide contains all the critical "gotchas" and API quirks required to get it working again.

## 1. Timeline Layout & State Management
The UI features a horizontally scrolling timeline with Past, Live, and Future pills.
- **State (`selectedRound`)**: 
  - `0`: Represents the **LIVE** market (e.g., 11:45 AM - 11:50 AM).
  - `-1, -2, -3...`: Represents **PAST** resolved markets (e.g., 11:40 AM, 11:35 AM).
  - `-99`: Represents the **FUTURE** upcoming market (e.g., 11:50 AM).

### Timeline Math & Rendering
Because the Binance backend API can sometimes fail or rate-limit, the timeline buttons **must be generated mathematically** using offsets from the current 5-minute window, rather than relying strictly on the backend array length.
- **Live Time Calculation**: `const liveEndMs = Math.ceil(now.getTime() / 300000) * 300000;`
- **Past Pills**: Rendered by subtracting 5 minutes (300,000 ms) and 10 minutes (600,000 ms) from `liveEndMs`.
- **Future Pills**: Rendered by adding 5 minutes to `liveEndMs`.
- **Selection Isolation**: The future market must use an isolated ID (like `-99`) so it doesn't conflict with past array indexes (like `-1`).

## 2. Polymarket Gamma API (Market Discovery)
To get the active market's Token IDs, we bypass the backend and fetch directly from Polymarket's Gamma API to avoid Cloudflare/CORS blocks on the server.

### The Slug Timestamp Rule (CRITICAL)
Polymarket's 5-minute BTC market slugs are formatted as `btc-updown-5m-{TIMESTAMP}`. 
**Crucial Gotcha:** The `{TIMESTAMP}` must be the **START TIME** of the 5-minute window, NOT the end time.
```typescript
const now = Date.now();
// CORRECT: Floor to the nearest 5 minutes (300 seconds) to get the START time.
const windowStartSeconds = Math.floor(now / 300000) * 300;
const slug = `btc-updown-5m-${windowStartSeconds}`;

// Fetch market events
const r = await window.fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
```
If you accidentally use the END time, you will fetch the **FUTURE** market before it officially opens, resulting in an empty order book or 99¢ dust orders.

## 3. Polymarket CLOB API (Order Book & Pricing)
Once you parse the `clobTokenIds` from the Gamma API response, you must fetch the live order book for both the YES and NO tokens from the CLOB API.

```typescript
const [resY, resN] = await Promise.all([
    window.fetch(`https://clob.polymarket.com/book?token_id=${activeBtcMarket.yesTokenId}`),
    window.fetch(`https://clob.polymarket.com/book?token_id=${activeBtcMarket.noTokenId}`)
]);
```

### The Order Book Sorting Bug (CRITICAL)
Polymarket's CLOB API does **NOT** always sort the `asks` array with the best (lowest) price at index `0`. Sometimes it is sorted descending, meaning `asks[0]` will return the absolute worst price in the book (usually `$0.99` placed by idle bots).

**Do NOT do this:**
```typescript
// WRONG: Will often result in 99¢ for both UP and DOWN
const bestAskY = parseFloat(bookY.asks[0].price); 
```

**Do this instead:**
You must parse the entire array and mathematically extract the lowest ask and the highest bid to guarantee accurate ~50¢ odds.
```typescript
// CORRECT: Mathematically extract the best prices
const bestBidY = bookY?.bids?.length ? Math.max(...bookY.bids.map((b: any) => parseFloat(b.price))) : 0.50;
const bestAskY = bookY?.asks?.length ? Math.min(...bookY.asks.map((a: any) => parseFloat(a.price))) : 0.50;
```

## 4. UI Price Fallbacks & Flash Animations
- **Chainlink PTB**: The "Price to Beat" (PTB) should be fetched from the Chainlink BTC/USD Oracle. If it fails, default to a live price feed like Binance or Coinbase.
- **Price Flashing**: Keep a small `setInterval` running to fetch the live spot price of BTC. When the price changes, temporarily append a CSS class (`pm-green` or `pm-red`) to animate the price flashing up or down for 600ms, providing a highly responsive feel even if Polymarket odds are moving slowly.
- **Empty States**: If a user clicks the Future market (`-99`), safely default the display Price to Beat to `0` (which renders as `—`) so the UI doesn't crash trying to access non-existent history data.
