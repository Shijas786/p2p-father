# P2P Escrow — How It All Works

## The Complete Trade Lifecycle

```
═══════════════════════════════════════════════════════════════════════
 STEP 1: SELLER CREATES ORDER (off-chain — Telegram + Supabase)
═══════════════════════════════════════════════════════════════════════

  Telegram:
  ┌────────────────────────────────────┐
  │ Seller: "sell 100 usdc at ₹88"    │
  │                                    │
  │ Bot: ✅ Order created!             │
  │   Amount: 100 USDC                 │
  │   Rate: ₹88/USDC                  │
  │   Total: ₹8,800 INR               │
  │   Payment: UPI                     │
  │   Order ID: #P2P-001              │
  │                                    │
  │   Your order is now live!          │
  └────────────────────────────────────┘

  Database (Supabase):
  ┌─────────────────────────────────────────────────┐
  │ orders table                                     │
  │ id: P2P-001, type: sell, amount: 100,           │
  │ rate: 88, status: active, payment: UPI          │
  └─────────────────────────────────────────────────┘

  ⚠️ NO crypto moves yet. It's just a listing.


═══════════════════════════════════════════════════════════════════════
 STEP 2: BUYER MATCHES ORDER (off-chain → triggers on-chain)
═══════════════════════════════════════════════════════════════════════

  Telegram:
  ┌────────────────────────────────────┐
  │ Buyer: "buy 100 usdc from #P2P-001│
  │                                    │
  │ Bot: 🔒 Trade matched!            │
  │                                    │
  │   @seller must deposit 100 USDC    │
  │   to escrow contract.             │
  │                                    │
  │   [Deposit Now 🔒]                │
  └────────────────────────────────────┘

  What happens:
  ┌──────────────┐                    ┌──────────────────────┐
  │   SELLER     │ ── 100 USDC ────► │  ESCROW CONTRACT     │
  │   Wallet     │    (approve +      │  (on Base chain)     │
  │              │     createTrade)    │                      │
  └──────────────┘                    │  Locked: 100 USDC    │
                                      │  Buyer:  0xBuyer     │
                                      │  Fee:    0.5 USDC    │
                                      │  Deadline: 30 minutes│
                                      └──────────────────────┘

  Smart Contract Call:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. USDC.approve(escrowContract, 100e6)                   │
  │ 2. escrow.createTrade(buyerAddr, usdcAddr, 100e6, 1800) │
  │    → emits TradeCreated event                            │
  │    → returns tradeId = 1                                 │
  └──────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
 STEP 3: BUYER SENDS FIAT (off-chain — UPI/Bank transfer)
═══════════════════════════════════════════════════════════════════════

  Real world:
  ┌──────────────┐    ₹8,800 via UPI    ┌──────────────┐
  │   BUYER      │ ──────────────────►  │   SELLER     │
  │   Bank/UPI   │                      │   Bank/UPI   │
  └──────────────┘                      └──────────────┘

  Telegram:
  ┌────────────────────────────────────┐
  │ Buyer: [I've Paid ✅]             │
  │                                    │
  │ Bot → Seller: "@buyer has sent     │
  │   ₹8,800 via UPI. Please check    │
  │   and confirm."                    │
  │                                    │
  │   [Confirm Received ✅]            │
  │   [Dispute ⚠️]                    │
  └────────────────────────────────────┘

  On-chain (optional status update):
  ┌──────────────────────────────────────────────────────────┐
  │ escrow.markFiatSent(tradeId)                             │
  │ → trade.status = FiatSent                                │
  │ → prevents seller from cancelling                        │
  └──────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
 STEP 4: SELLER CONFIRMS → RELEASE (on-chain)
═══════════════════════════════════════════════════════════════════════

  Telegram:
  ┌────────────────────────────────────┐
  │ Seller: [Confirm Received ✅]      │
  │                                    │
  │ Bot: ✅ Trade completed!           │
  │   Buyer receives: 99.50 USDC      │
  │   Fee collected: 0.50 USDC        │
  │   TX: 0xabc123...                 │
  └────────────────────────────────────┘

  Smart Contract Call:
  ┌──────────────────────────────────────────────────────────┐
  │ escrow.release(tradeId)                                  │
  │                                                          │
  │ Contract does:                                           │
  │   1. USDC.transfer(buyer, 99.50 USDC)   → buyer wallet  │
  │   2. USDC.transfer(admin, 0.50 USDC)    → fee wallet    │
  │   3. trade.status = Completed                            │
  │   4. emit TradeReleased(...)                             │
  └──────────────────────────────────────────────────────────┘

  Final state:
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   SELLER     │  │   BUYER      │  │   ADMIN      │
  │              │  │              │  │              │
  │  +₹8,800    │  │  +99.5 USDC  │  │  +0.5 USDC   │
  │  -100 USDC  │  │  -₹8,800     │  │  (fee! 💰)   │
  └──────────────┘  └──────────────┘  └──────────────┘


═══════════════════════════════════════════════════════════════════════
 ALTERNATE: TIMEOUT REFUND (if buyer doesn't pay)
═══════════════════════════════════════════════════════════════════════

  ⏰ 30 minutes passes, buyer never sent fiat...

  ┌──────────────────────────────────────────────────────────┐
  │ escrow.refund(tradeId)                                   │
  │ → Anyone can call this after deadline                    │
  │                                                          │
  │ Contract does:                                           │
  │   1. Check: block.timestamp > trade.deadline ✅          │
  │   2. USDC.transfer(seller, 100 USDC)  → full refund     │
  │   3. trade.status = Cancelled                            │
  │   4. emit TradeRefunded(...)                             │
  │                                                          │
  │ 💡 NO fee charged on refunds!                           │
  └──────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
 ALTERNATE: DISPUTE FLOW
═══════════════════════════════════════════════════════════════════════

  Scenario: Buyer says "I paid" but seller says "I didn't receive"

  ┌────────────────────────────────────┐
  │ Seller: [Dispute ⚠️]              │
  │ Reason: "No payment received"      │
  └──────────────────┬─────────────────┘
                     │
  On-chain:          │
  ┌──────────────────▼───────────────────────────────────────┐
  │ escrow.raiseDispute(tradeId, "No payment received")      │
  │ → trade.status = Disputed                                │
  │ → Deadline extended to 72 hours (admin resolution time)  │
  │ → Funds FROZEN in contract                               │
  └──────────────────────────────────────────────────────────┘
                     │
  Bot notifies admin │
                     ▼
  ┌────────────────────────────────────┐
  │ Admin Panel:                       │
  │                                    │
  │ Trade #1 — DISPUTED ⚠️            │
  │ Seller: @seller (50 trades, 98%)   │
  │ Buyer: @buyer (12 trades, 95%)     │
  │ Amount: 100 USDC / ₹8,800         │
  │ Reason: "No payment received"      │
  │                                    │
  │ Evidence:                          │
  │ 📸 Buyer's payment screenshot      │
  │ 📸 Seller's bank statement         │
  │                                    │
  │ AI Recommendation: REFUND_SELLER   │
  │ (85% confidence)                   │
  │                                    │
  │ [Release to Buyer ✅]              │
  │ [Refund to Seller 🔄]              │
  └──────────────────┬─────────────────┘
                     │
  Admin decides:     │ "Refund to seller"
                     ▼
  ┌──────────────────────────────────────────────────────────┐
  │ escrow.resolveDispute(tradeId, false)                    │
  │ → USDC.transfer(seller, 100 USDC)  → full refund        │
  │ → trade.status = Refunded                                │
  │ → Buyer's trust score -10                                │
  └──────────────────────────────────────────────────────────┘
```

---

## How Smart Contract Interacts with the Bot

```
┌─────────────────────────────────────────────────────────────────┐
│                     TELEGRAM BOT (Backend)                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  RELAYER SERVICE (ethers.js)                              │   │
│  │                                                           │   │
│  │  // Bot's wallet (relayer) that calls contract functions  │   │
│  │  const wallet = new ethers.Wallet(RELAYER_PRIVATE_KEY);   │   │
│  │  const escrow = new ethers.Contract(ESCROW_ADDR, ABI);    │   │
│  │                                                           │   │
│  │  // When seller deposits:                                 │   │
│  │  // 1. Guide seller to approve USDC spending              │   │
│  │  // 2. Seller calls createTrade() from THEIR wallet       │   │
│  │  //    (via WalletConnect or bot-generated tx link)        │   │
│  │                                                           │   │
│  │  // When seller confirms fiat:                            │   │
│  │  await escrow.connect(relayerWallet).release(tradeId);    │   │
│  │                                                           │   │
│  │  // When timeout:                                         │   │
│  │  await escrow.connect(relayerWallet).refund(tradeId);     │   │
│  │                                                           │   │
│  │  // When dispute:                                         │   │
│  │  await escrow.connect(relayerWallet)                      │   │
│  │    .resolveDispute(tradeId, releaseToBuyer);              │   │
│  │                                                           │   │
│  │  // Listen for events:                                    │   │
│  │  escrow.on("TradeCreated", (id, seller, buyer, ...) => {  │   │
│  │    // Update Supabase, notify users                       │   │
│  │  });                                                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## How Users Interact with the Contract

### Option A: Via Agentic Wallet (Simplest for Users)
```
User doesn't need MetaMask or any wallet app!

1. User authenticates with Agentic Wallet (email)
2. Bot uses `awal` CLI to handle USDC approvals and deposits
3. Everything happens through the Telegram bot chat

Commands the bot runs for the user:
  npx awal send <amount> <escrow_contract_address>  ← deposit to escrow
  (or uses ethers.js to call approve + createTrade directly)
```

### Option B: Via WalletConnect / External Wallet
```
For users who want to use their own MetaMask/Rabby wallet:

1. Bot generates a WalletConnect deep link
2. User scans QR or clicks link
3. Signs the approve + createTrade transaction in their wallet
4. Bot monitors blockchain for TradeCreated event
```

### Option C: Hybrid (Recommended ⭐)
```
- NEW USERS → Agentic Wallet (easy onboarding, email-based)
- ADVANCED USERS → Connect their own wallet (WalletConnect)
- Both interact with the SAME escrow contract
```

---

## Contract Addresses (After Deployment)

| Contract | Network | Address |
|----------|---------|---------|
| P2PEscrow | Base Mainnet | TBD (after deploy) |
| P2PEscrow | Base Sepolia (testnet) | TBD (after deploy) |
| USDC | Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| USDC | Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Gas Costs on Base (Estimated)

| Operation | Estimated Gas | Cost (at 0.01 gwei) |
|-----------|--------------|---------------------|
| approve USDC | ~46,000 | < $0.01 |
| createTrade | ~120,000 | < $0.01 |
| markFiatSent | ~45,000 | < $0.01 |
| release | ~85,000 | < $0.01 |
| refund | ~65,000 | < $0.01 |
| raiseDispute | ~55,000 | < $0.01 |
| resolveDispute | ~85,000 | < $0.01 |

**Total cost per trade: < $0.03** (Base L2 is extremely cheap!)

---

## Security Checklist

- [x] ReentrancyGuard on all fund-moving functions
- [x] SafeERC20 for all token transfers
- [x] Ownable for admin functions
- [x] Max fee cap (5%) — admin can't set absurd fees
- [x] Time-locked escrow with auto-refund
- [x] Only approved relayers can release/refund
- [x] Dispute extends deadline (prevents timeout during dispute)
- [x] Active trade count limit per user (anti-spam)
- [x] Min trade amount (1 USDC)
- [x] Cannot trade with yourself
- [ ] TODO: Audit before mainnet deployment
- [ ] TODO: Pausable in case of emergency
- [ ] TODO: Upgradeable proxy for future improvements
