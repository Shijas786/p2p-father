# P2PFather Miniapp Architecture Audit

This document provides a comprehensive technical overview of how the **P2PFather** Miniapp operates, with a specific focus on the newly integrated **Predict (Polymarket)** feature. It outlines the data flow, API endpoints, smart contract integrations, and the workarounds applied to ensure stability.

---

## 1. System Overview
The P2PFather Miniapp is a Telegram-integrated Web3 platform originally built for P2P trading. It utilizes an Express/TypeScript backend connected to a Postgres/Supabase database. The frontend is built using React and interfaces directly with the Telegram Mini App API.

### **The "Predict" Feature**
The "Predict" feature allows users to place 5-minute bets on whether the price of Bitcoin (BTC) will go UP or DOWN. This is powered by **Polymarket** under the hood. However, instead of making users connect external wallets, the system uses abstract **Proxy Wallets** (via Biconomy) derived from the user's Telegram ID to execute trades seamlessly behind the scenes.

---

## 2. Wallet & Smart Contract Architecture

Because Telegram users don't have native Web3 wallets, the application abstracts the blockchain away using Biconomy Relayers and Proxy Contracts.

1. **Wallet Indexing (`wallet_index`)**: 
   When a user registers, they are assigned a `wallet_index` in the database.
2. **Deterministic Proxy Wallet**: 
   The `polymarketRelayerService` uses the `wallet_index` to derive a unique, deterministic Biconomy Proxy Wallet address for that user.
3. **Fund Management**:
   Users deposit funds (USDC on Polygon) to this Proxy Wallet. 
4. **Smart Contract Deployment**:
   The Proxy Contract doesn't exist on the blockchain until the user makes their first transaction. When they place their first trade, the backend fires a transaction to the Biconomy factory to deploy the proxy contract dynamically.

---

## 3. Polymarket Integration Flow (The Complexity)

Polymarket's native SDK (`@polymarket/clob-client-v2`) expects a standard EOA (Externally Owned Account) wallet (like MetaMask). It does **not** natively support proxy wallets. 

### **The Auth Override (EIP-1271)**
To trade on Polymarket, the client must generate an API key (L2 credentials) signed by the wallet. Since our wallet is a Proxy Contract, we must use **EIP-1271 (Standard Signature Validation Method for Contracts)**. 
- The backend overrides the SDK's native authentication generator.
- It builds a custom payload that explicitly injects the Proxy Wallet's address into the `POLY_ADDRESS` header.
- It signs the request using the backend's Master Key, which is configured as an authorized signer on the Proxy Contract.

---

## 4. Backend API Endpoints (`src/api/miniapp.ts`)

The backend exposes several routes under `/api/miniapp/predictions` to serve the frontend.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/predictions/market` | `GET` | Fetches the currently active BTC 5-minute market from Polymarket. Includes the `conditionId`, the exact `yesTokenId` (UP), and `noTokenId` (DOWN). |
| `/predictions/buy` | `POST` | Places a limit order on the Polymarket CLOB (Central Limit Order Book). Takes `{ amount, isUp }` and executes via the Biconomy Relayer. |
| `/predictions/positions`| `GET` | Returns the user's active, open positions on Polymarket. |
| `/predictions/trades` | `GET` | Retrieves the history of trades placed by the proxy wallet. |
| `/predictions/history` | `GET` | Fetches historical 5-minute BTC candlestick data directly from **Binance** to build the historical UI chart, as Polymarket doesn't store empty historical markets reliably. |
| `/predictions/claim` | `POST` | Triggers a smart contract transaction to redeem winning shares into USDC. |

---

## 5. Frontend Architecture (`Predict.tsx` & `TradePanel.tsx`)

### **The Live Market Timer**
- The frontend hits `/predictions/market` to find out what the current 5-minute round is.
- A `setInterval` (`tick()`) runs every second to calculate the time remaining until the clock hits a 5-minute interval (e.g., 2:05, 2:10).
- When the timer hits 0, it dynamically delays for 1 second, then requests the *next* market from the backend to seamlessly roll over.

### **Historical Data vs Polymarket Data**
- Because 5-minute markets close instantly, the frontend uses the Binance K-line API (`/predictions/history`) to generate the historical tape at the top of the screen.
- When you click an older round, the UI switches to "Historical Mode", pausing the timer and loading your trades from that specific timestamp.

### **The Claim Winnings Flow**
1. **The Lag Problem**: Polymarket's Data API takes 5-15 minutes to register that a market has resolved. If we relied entirely on the Data API, users would complain that their winnings are "stuck".
2. **The Auto-Claim Bypass**: The frontend calculates internally whether you won (`winQty > 0`). If you did, it displays the "Claim Winnings" button.
3. **The Execution**: Clicking the button sends the specific `conditionId` to the backend. Because the backend receives the exact ID, it skips the Polymarket Data API entirely and fires a direct `redeemPositions` transaction to the blockchain, instantly crediting the user's wallet!

---

## 6. Challenges & Known Issues (Trade Routes, Resolution, & Claiming)

Integrating Polymarket into a fast-paced 5-minute prediction environment surfaced several significant architectural challenges:

### **Trade Route & API Unreliability**
- **Gamma API Instability**: Polymarket's Gamma API (used for resolving market slugs and fetching real-time metadata) is often unreliable and frequently returns 404s or `ENOTFOUND` errors, especially for short-lived or newly created markets. Relying directly on frontend Gamma calls led to broken UI states (e.g., stuck timers and prices frozen at `0-0`).
- **Cloudflare Rate Limiting**: The CLOB API enforces strict Cloudflare protections. Backend services attempting to fetch market data were silently blocked (403 Forbidden) when missing standard browser `User-Agent` and `Accept` headers, causing trade outcome resolution to fail and masking winning trades from the user.

### **Market Resolution Delays**
- **Oracle Settlement**: Polymarket relies on the UMA oracle for market resolution. While the 5-minute window closes exactly on time, the actual on-chain resolution and oracle settlement can be delayed. 
- **Historical Data Sync**: Because Polymarket does not retain short-lived markets cleanly in its historical endpoints, the system relies on pulling raw 5-minute K-line data directly from Binance to render the historical chart and determine the "UP" or "DOWN" outcome locally, rather than waiting for the official oracle response.

### **The "Claiming" Bottleneck**
- **Data API Indexing Lag**: Polymarket's Data API (used by the background job to find open positions) suffers from severe indexing lag. It can take up to 15-30 minutes for a winning position to be indexed as `redeemable = true`.
- **Manual Claim Override**: Because of this lag, users were confused when their winnings didn't immediately hit their wallets. To solve this, a manual **"Claim Winnings"** button was introduced. By extracting the exact `conditionId` from the user's trade receipts and bypassing the Data API, the backend can directly force the smart contract redemption (`redeemPositions`) the moment the user clicks the button.

---

## 7. Recent Fixes & Edge Cases Addressed

1. **Gamma API Fallback**: 
   The frontend previously crashed when Polymarket's Gamma API returned 404 for missing `btc-updown-5m` slugs. All market discovery is now handled robustly by the backend `/predictions/market`.
2. **Cloudflare Blocking**: 
   When matching historical trades to the "UP" or "DOWN" label, the backend fetches data from `clob.polymarket.com`. Cloudflare was blocking these requests with 403 Forbidden because it lacked a `User-Agent`. We injected browser headers into the backend fetch to bypass this, successfully identifying winning positions.
3. **UI Timer Freeze**: 
   Navigating between historical markets and the live market would cause the URL parameters to stick, freezing the live countdown timer. This was resolved by forcing proper React Router navigation when clicking "Go to live market".
4. **False Positive Claim UI State**: 
   When a user clicked the manual "Claim Winnings" button *before* the Polymarket Oracle had officially settled the market, the smart contract transaction (`redeemPositions`) would revert. However, because the backend caught the error gracefully to prevent a crash, it still returned a `200 OK` to the frontend with `claimed: 0`. The frontend falsely assumed this meant success, cached `hasClaimed = true` in local storage, and permanently hid the claim button from the user despite them receiving no funds. The frontend was updated to strictly check `if (res.claimed > 0)` before hiding the button, allowing users to try again once the oracle officially settles the market.

## Conclusion
The P2PFather Predict feature successfully bridges the gap between Web2 UX and Web3 execution. By masking wallet creation, handling complex EIP-1271 signatures, and aggressively bypassing Polymarket's data indexing delays, users experience a real-time, seamless betting experience directly within Telegram.
