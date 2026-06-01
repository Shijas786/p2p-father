# P2PFather — Security & Bug Audit

**Date:** 2026-05-03
**Scope:** Full codebase (Telegram bot, mini-app API, smart contracts, Supabase schema, deployment config)
**Stack reviewed:** TypeScript backend (`src/`, `api/`), Solidity contracts (`P2PEscrow.sol`, `P2PEscrow_V2.sol`), Supabase migrations, Vercel + Express config

> **Important:** This is a code review, not a formal audit. It surfaces issues a fast attacker would likely find — there may be more in code paths I didn't trace exhaustively (jobs, AI service, bridge, multipart edge-cases). For a production money-handling system, you should still pay for a third-party Solidity audit.

---

## Severity Legend

- **CRITICAL** — direct money-loss / account takeover
- **HIGH** — unauthorized data access, money loss with extra steps, or single-config-flip-from-disaster
- **MEDIUM** — abuse, DoS, integrity issues
- **LOW** — hardening, sloppiness, future risk

---

## Summary Table

| # | Severity | Title | Location |
|---|----------|-------|----------|
| 1 | CRITICAL | `emergencyWithdraw` lets owner drain all escrow + vault funds | `contracts/P2PEscrow.sol:580`, `contracts/P2PEscrow_V2.sol:356` |
| 2 | CRITICAL | Unauthenticated trade enumeration (IDOR) on Vercel `/api/trades` | `api/trades.ts:5` |
| 3 | CRITICAL | Vercel `/api/auth` mints no session — protected endpoints are unreachable, public endpoints unprotected | `api/auth.ts` (whole file) |
| 4 | CRITICAL | `NODE_ENV=development` auth bypass logs anyone in as hardcoded admin | `src/api/miniapp.ts:56-69` |
| 5 | CRITICAL | V2 `createTradeByRelayer` removed `_buyer != 0` and self-trade checks | `contracts/P2PEscrow_V2.sol:163-179` |
| 6 | CRITICAL | V2 `createTrade` does not refund excess `msg.value` | `contracts/P2PEscrow_V2.sol:219-220` |
| 7 | HIGH | `MASTER_WALLET_SEED` in `.env` controls every user wallet | `src/services/wallet.ts:36-44`, `.env` |
| 8 | HIGH | RLS policy is `USING (true)` — full DB exposure if anon key leaks | `src/db/migrations/001_initial.sql:252-255` |
| 9 | HIGH | `POST /wallet/connect` accepts any address with no ownership proof | `src/api/miniapp.ts:280-300` |
| 10 | HIGH | `GET /trades/:id` and `/orders/:id` have no authorization check | `src/api/miniapp.ts:441, 676` |
| 11 | HIGH | HTML-mode Telegram notifications interpolate user content | `src/api/miniapp.ts:1378-1381`, multiple sites |
| 12 | HIGH | Hash-validated user but `auth_date` window is 24 h (Telegram recommends ≤1 h) | `src/api/miniapp.ts:117`, `api/auth.ts:42` |
| 13 | HIGH | V2 contract has `Disputed` state but no `raiseDispute()` / `resolveDispute()` — backend calls fail silently | `contracts/P2PEscrow_V2.sol`, `src/api/miniapp.ts:1119` |
| 14 | MEDIUM | `POST /wallet/send` lets API drain custodial wallet up to 100,000 with no rate limit | `src/api/miniapp.ts:232-273` |
| 15 | MEDIUM | `/api/miniapp/bridge/quote` builds URL with unencoded user input → SSRF/URL-injection toward `li.quest` | `src/api/miniapp.ts:1509-1515` |
| 16 | MEDIUM | `/wallet/vault/withdraw` reservation check uses off-chain DB; can race on-chain withdraw | `src/api/miniapp.ts:386-396` + escrow.ts |
| 17 | MEDIUM | `POST /trades/:id/dispute` writes raw user reason into HTML chat & admin DM | `src/api/miniapp.ts:1099-1145` |
| 18 | MEDIUM | Avatar/chat upload trusts `originalname` extension and `mimetype` (no content sniff) | `src/api/miniapp.ts:1411, 1577` |
| 19 | MEDIUM | No rate limiting / no `helmet` on Express server | `src/index.ts:38-50` |
| 20 | MEDIUM | Two `bot.command("admin")` handlers registered (silent override) | `src/bot/index.ts:1215, 1274` |
| 21 | MEDIUM | `getOrCreateUser` race uses read-then-insert with retry — still lets stale `wallet_index` slip in if the unique index is missing | `src/db/client.ts:46-100`, `supabase/migrations/add_wallet_index_unique.sql` |
| 22 | LOW | Old Telegram bot token left as a comment in `.env` (`OLD_TOKEN: 8559…`) | `.env:9` |
| 23 | LOW | Debug routes guarded only by `NODE_ENV === 'development'` (dump full users + orders) | `src/api/miniapp.ts:489-512` |
| 24 | LOW | `contracts/P2PEscrow.sol` `MIN_TRADE_AMOUNT` hardcoded to 1e6 — meaningless for 18-decimal tokens | `contracts/P2PEscrow.sol:43` |
| 25 | LOW | `markFiatSent` doesn't extend `deadline` — narrow window can strand FiatSent trades | `contracts/P2PEscrow_V2.sol:259-267` |

---

## Critical Findings (fix before next deploy)

### 1. Owner can drain everything via `emergencyWithdraw`

`contracts/P2PEscrow.sol:580-584` and `contracts/P2PEscrow_V2.sol:356-363`:

```
function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
    IERC20(_token).safeTransfer(owner(), _amount);   // V1 — no checks at all
}
```

The V1 comment even acknowledges it: *"Cannot withdraw tokens that belong to active trades"* — but that check is **not implemented**. Owner can pull every USDC/USDT/BNB held by the contract at any time, including funds locked in active escrows and unrelated user vault balances. This is the single biggest centralization risk and the same key signs deployments. If the deploy key leaks (it lives somewhere — hardware wallet? laptop? a CI secret?), every dollar in both deployed contracts is gone in one tx.

**Fix:**
- Track `totalEscrowedPerToken` and require `IERC20.balanceOf(this) - totalEscrowedPerToken[_token] >= _amount`.
- Move ownership behind a multisig (Gnosis Safe) and a 24–48 h Timelock.
- Document this loudly (or remove `emergencyWithdraw` and use `owner can rescue mistakenly-sent unsupported tokens` only).

### 2. `GET /api/trades?user_id=…` — unauthenticated trade enumeration

`api/trades.ts:5-30`:

```ts
const { user_id } = req.query;
if (!user_id) return res.status(400).json({ error: "Missing user_id" });
const trades = await db.getUserTrades(user_id);
```

This Vercel function has **no auth at all**. Anyone on the internet can `GET https://p2pfather.com/api/trades?user_id=<uuid>` and pull a user's trade history (amounts, status, fiat amount, counterparty role) once they know the UUID. UUIDs leak from the user profile JSON, the leaderboard, and any public surface that returns `user.id`.

**Fix:** delete this file or gate it behind the same `validateInitData` middleware used by the mini-app router and require the requester is the queried user. Then check the same for `api/ads.ts`, `api/index.ts` (stats — fine to be public), `api/auth.ts`.

### 3. `api/auth.ts` produces no session — endpoint is decorative

`api/auth.ts:46-55`:

```ts
return res.status(200).json({
    success: true,
    user: { id: user?.id, telegram_id: id, username, first_name, photo_url }
});
// Comment: "In a real app, we'd set a JWT cookie here"
```

The function validates the Telegram login-widget hash correctly, but **never issues a cookie/JWT/session token**. Combined with finding (2), the Vercel surface is effectively *"no auth"*. Either remove this endpoint and rely on the Telegram WebApp `init-data` flow (already used by `src/api/miniapp.ts`), or finish it: set a signed httpOnly cookie and verify it on every protected request.

Also: `if (now - auth_date > 86400)` allows replays for 24 hours. Telegram Login docs say ≤1 hour. Same window exists in `src/api/miniapp.ts:117`.

### 4. `NODE_ENV=development` becomes a master key

`src/api/miniapp.ts:56-69`:

```ts
if (!initData && env.NODE_ENV === "development") {
    req.telegramUser = { id: 123456789, ..., is_admin: true };
    return next();
}
```

If anyone deploys with `NODE_ENV=development` (Vercel preview, Railway misconfig, Docker default…), every unauthenticated request is treated as the hardcoded admin user `123456789`. A 5-line attacker script then drains via `/wallet/send`, resolves disputes in their favour, etc. There's a second, milder bypass at line 96-104 that accepts any user data when `NODE_ENV === "development"` even if the hash fails.

**Fix:** delete the dev bypass entirely and switch dev to a real test bot token + a `.env.development` with proper init data, or gate the bypass on a hostname check (`req.hostname === 'localhost'`) **and** an explicit `ALLOW_DEV_BYPASS=1` flag. Also check the live deployment right now: `curl https://p2pfather.com/api/miniapp/auth` should NOT succeed. A failing call returning the error JSON is good. A successful one means you're already running compromised.

### 5. `createTradeByRelayer` (V2) dropped sanity checks

`contracts/P2PEscrow_V2.sol:163-179` vs `P2PEscrow.sol:233-244`. V1 had:

```
require(_buyer != address(0), "Invalid buyer");
require(_seller != _buyer, "Self trade");
require(approvedTokens[_token], "Token not approved");
```

V2 removed all three. Combined with finding (4) or any relayer-key compromise: an attacker can now create a trade that sends seller's funds to `address(0)` (burning them), to themselves (self-trade for fake volume / wash-trade spam), or to a non-approved token (which `minTradeAmount[_token]` defaults to 0 for, so the lower bound also disappears). A malicious relayer can target any address with vault balance.

**Fix:** put the three `require`s back; ideally also `require(approvedTokens[_token], …)` so `minTradeAmount[_token]==0` can't bypass dust limits.

### 6. V2 `createTrade` doesn't refund excess native value

`contracts/P2PEscrow_V2.sol:219-220`:

```
if (_token == address(0)) {
    require(msg.value >= _amount, "Insufficient BNB sent");
}
```

If the caller sends more BNB than `_amount`, the difference is silently kept by the contract and only the owner can reclaim it via `emergencyWithdraw`. `_amount` should equal `msg.value` exactly (`require(msg.value == _amount …)`) or refund the delta.

---

## High-Priority Findings

### 7. Single seed for all users

`MASTER_WALLET_SEED` is a 12/24-word phrase that derives every custodial wallet (`m/44'/60'/0'/0/<userIndex>`). It sits in `.env`. Comment in `.env.example` says *"⚠️ NEVER share this. One seed = ALL user wallets."* — but it's still a single hot secret on whichever box runs the bot. If that box is compromised, every user's funds AND the `RELAYER_PRIVATE_KEY` (also in `.env`) are gone.

**Fix:** at minimum, move both into a managed secret store (AWS KMS / GCP Secret Manager / Doppler / 1Password Connect) and derive on a separate signing service. Long-term: don't be custodial — let users connect external wallets and keep your role to the smart contract.

### 8. RLS policies are wide open

`src/db/migrations/001_initial.sql:252-255`:

```
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);
```

Naming says "service role only" — actual policy says "anyone". Today this only matters if `SUPABASE_ANON_KEY` is exposed to the frontend (it's in `.env` next to the service key, so it's plausibly in the mini-app bundle). If it is, anyone can `SELECT * FROM users` directly via `https://<project>.supabase.co/rest/v1/users` and read every UPI ID, bank account number, phone number, wallet address.

Verify by running `curl 'https://<your-project>.supabase.co/rest/v1/users?select=*' -H "apikey: <ANON_KEY>"`. If it returns rows, you have a data breach right now.

**Fix:** drop those policies and write proper per-row policies, OR rename the policy and restrict it: `USING (auth.role() = 'service_role')` so only the service key can read.

### 9. `POST /wallet/connect` — no signature check

`src/api/miniapp.ts:280-300` accepts an arbitrary `0x…` address and stores it as the user's wallet. No signature, no SIWE message, no proof of ownership. Side effects:
- Attacker can claim any whale's address as their own to make their sell ads look better-funded (`validateSellerBalances` only checks the contract's vault balance for that address — but if attacker hasn't deposited, this fails fast). Less impactful than I first thought, but still wrong.
- More importantly: when external-wallet sellers later flow through `/trades/:id/lock`, the seller's identity vs. the on-chain creator can be spoofed in messaging.

**Fix:** standard EIP-4361 (Sign-In With Ethereum). Issue a nonce, have the wallet sign `"P2PFather: connect wallet for user <id> at <timestamp> nonce=<nonce>"`, verify with `ethers.verifyMessage`.

### 10. Trade and order detail endpoints have no auth check

`src/api/miniapp.ts:441-450` (`GET /orders/:id`) and `:676-685` (`GET /trades/:id`) load by id and return the full row. Trade rows include `buyer_id`, `seller_id`, `escrow_tx_hash`, `fiat_amount`, `dispute_reason`. Anyone with a valid Telegram init data (i.e. anyone using the bot) can iterate UUIDs found via the leaderboard / live-pulse / broadcasts and read other users' trade contents.

**Fix:** require `req.telegramUser.id` is the buyer or seller (or an admin) for `/trades/:id`. For `/orders/:id`, orders are public-by-design but still strip `payment_details` (UPI etc.) unless the requester is the owner.

### 11. HTML-mode Telegram messages interpolate user content

Many notifications use `parse_mode: "HTML"` and embed user-controlled strings (chat messages, dispute reasons, usernames):

- `src/api/miniapp.ts:1378-1381` — chat message → other party
- `src/api/miniapp.ts:1099-1145` — dispute reason → both parties + admins
- `src/api/miniapp.ts:1296-1301` — admin chat message → both parties

Telegram HTML mode supports `<a href="…">`, so a chat message of `<a href="https://phishing.example/upi-confirm">Confirm payment</a>` renders as a clickable link **inside the trade chat notification** — perfect for in-trade phishing. Usernames are safe (Telegram restricts charset) but `message`, `reason`, and `bio` aren't.

**Fix:** HTML-escape any user content before insertion (`s.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/&/g,'&amp;')`), or switch those notifications to MarkdownV2 with `escapeMarkdown` (which the bot already imports for everything else).

### 12. Auth-date window is 24 h

Telegram WebApp auth data should be revalidated every ≤ 1 hour. A leaked init-data string (logged, screenshotted, captured by an extension) is therefore valid for a full day — long enough to drain. Drop both windows to 3600.

### 13. V2 contract is missing dispute functions but the backend calls them

`src/api/miniapp.ts:1119-1125` calls `escrow.raiseDispute(...)`, but `P2PEscrow_V2.sol` has no `raiseDispute()` or `resolveDispute()` and the `Disputed` enum value is unreachable. The call reverts; `try/catch` swallows it; the off-chain trade record says "disputed", on-chain still says "Active" or "FiatSent". Admin then resolves by calling `release()` or `refund()` directly — which mostly works, but:

- `refund()` only allows the relayer when `trade.status != Completed`, so admin can refund. OK.
- But the *ABI in `escrow.ts`* still declares `raiseDispute`, `resolveDispute`, and `event AutoReleased` / a 3-arg `FiatMarkedSent`. If someone deploys `P2PEscrow_V2` thinking the JS layer matches, it doesn't.

**Fix:** keep the on-chain/off-chain ABI in sync. Either re-add `raiseDispute` / `resolveDispute` to V2 or strip them from `src/services/escrow.ts` and stop calling them.

---

## Medium-Priority Findings

### 14. Custodial sweep risk via `/wallet/send`

`src/api/miniapp.ts:232-273` accepts `to`/`amount`/`token`/`chain`, validates `0 < amount ≤ 100000`, then calls `wallet.sendNative` / `sendToken` from the user's HD-derived wallet. If either auth bypass (4) is exploited, a single API call can move 100,000 USDC. Even without the bypass, a stolen Telegram session or a successful CSRF (CORS is `*`, no `credentials: include`) would let an attacker drain a victim's wallet.

**Fix:** rate-limit per user, require a 2nd-factor for amounts > a small threshold (e.g. send a confirmation button to the user's Telegram DM), and validate `to` with `ethers.isAddress`. Also tighten `ACAO: *` — set the Mini App's exact origin and reject unknown ones.

### 15. URL-injection in bridge quote

`src/api/miniapp.ts:1509-1515`:

```ts
const response = await fetch(
    `https://li.quest/v1/quote?fromChain=${fromChainId}&toChain=${toChainId}&fromToken=${fromToken === "USDC" ? "USDC" : fromToken}&toToken=${toToken === "USDC" ? "USDC" : toToken}&fromAmount=${amount}&fromAddress=0x0…`
);
```

Inputs are interpolated raw. `fromChainId=1&malicious=…` injects extra params. Worse, you could pass `fromChainId=ignored#&newhost=…` — though `https://li.quest/...` is hardcoded so true SSRF is bounded. Still: validate each param with `Number()` / regex, and use `URLSearchParams` to build the query string.

### 16. Off-chain reservation race

`/wallet/vault/withdraw` (`src/api/miniapp.ts:386-396`) computes `available = physicalBalance - reserved` from DB. Two simultaneous calls — say a `withdraw` and a new ad/match — read the same `physicalBalance` and pass the check, then both proceed; the second on-chain tx may fail with "Insufficient seller vault balance" but the first already drained the chain side. The DB has nothing recording the drain. Net result: a created order that can't be filled, plus user confusion. Not a money-loss for the platform, but a stuck-order foot-gun.

**Fix:** transactionally write a `pending_withdraw` row before the on-chain call, count it in `getReservedAmount`, clear it on success/failure.

### 17–18. Untrusted file uploads

Avatar (`/profile/avatar`) and chat image upload (`/trades/:id/messages/upload`) trust:
- `req.file.mimetype` (HTTP header sent by client),
- `req.file.originalname.split(".").pop()` for the file extension.

A user can upload `evil.html` with `Content-Type: image/png`, get a public Supabase URL, and host phishing pages on `your-supabase.co/storage/...`. Multer keeps the buffer in memory so size is bounded by the 5 MB limit, but content is not sniffed. Use `file-type` (npm) to verify the actual magic bytes, and force the saved extension from the detected type rather than `originalname`.

### 19. No rate-limiting / no `helmet`

`src/index.ts:38-50` mounts `express.json()` and the miniapp router but adds no `express-rate-limit`, no slow-down, no helmet. `/api/leaderboard` calls a Postgres RPC that scans users — a few hundred parallel requests will hit Supabase quotas. `/api/live-pulse` joins two tables. CORS is wildcard. Add `express-rate-limit` (per-IP, e.g. 60 req/min) at minimum and `helmet()` for default headers.

### 20. Duplicated `bot.command("admin")`

`src/bot/index.ts:1215` and `:1274` both register handlers for `/admin`. grammy fires only the first, so the second one is dead code. Cosmetic, but it suggests a refactor went sideways — worth grepping for similar duplicates (`/start` shows up at 365 once, OK).

### 21. `getOrCreateUser` race window

`src/db/client.ts:46-100` selects max(wallet_index), increments, inserts. The unique index added in `add_wallet_index_unique.sql` makes this race-safe — assuming that migration has been applied to prod. Confirm with `\d users` in psql, otherwise two simultaneous signups can still get the same index and derive the same wallet.

---

## Low-Priority Findings

### 22. Old token left in `.env`
`.env` line ~9 has `# OLD_TOKEN: TELEGRAM_BOT_TOKEN_PLACEHOLDER`. If that token wasn't revoked at BotFather, anyone with `.env` history (commit history, backups, forgotten Slack DMs…) can take over the old bot. Verify it's revoked and delete the comment.

### 23. Debug routes
`src/api/miniapp.ts:489-512`. `/debug/db-dump` returns full users + orders. Gated by `NODE_ENV === 'development'`, so it's the same blast radius as finding (4). Delete or hide behind a non-Telegram secret.

### 24. `MIN_TRADE_AMOUNT = 1e6` only fits USDC
`P2PEscrow.sol:43` is `1e6` (= 1 USDC), but the same constant is checked for any approved 18-decimal token. Effectively no minimum for non-USDC. V2 fixed this with `minTradeAmount[token]` — keep V1 retired, or backport.

### 25. `markFiatSent` doesn't extend deadline
If buyer marks fiat sent at `deadline - 1 second`, seller has ~0 time to release before the deadline passes. Refund-after-deadline only works in `Active` state, so a FiatSent trade past deadline is stuck until someone calls `raiseDispute` (V1) / admin steps in (V2). Add `trade.deadline = max(trade.deadline, block.timestamp + 1 hours)` in `markFiatSent`.

---

## What Looked Good

- Telegram WebApp init-data hash check is correctly implemented (`HMAC(sha256("WebAppData") || botToken)`).
- `fillOrder` / `revertFillOrder` use optimistic concurrency control — good.
- `updateTradeStatusAtomic` prevents double-release in the `fiat_sent → releasing` transition.
- Smart contracts use OpenZeppelin v5, `ReentrancyGuard`, `SafeERC20`.
- 1-hour dispute cooldown is enforced on both client and server (saw `82fde3c` in git log).
- UTR de-duplication exists (`isUTRUsed`).
- HD wallet derivation is sound (BIP-44, no private key reuse).
- `.env` is in `.gitignore` and not tracked.

---

## Recommended Order of Fixes

1. Confirm `NODE_ENV` is **never** "development" in any deployed environment, then delete the dev bypasses (finding 4).
2. Delete or auth-gate `api/trades.ts`, `api/ads.ts`, `api/auth.ts` (findings 2-3).
3. Add auth checks to `GET /trades/:id` and `GET /orders/:id` (finding 10).
4. HTML-escape user content in Telegram notifications (finding 11).
5. Migrate ownership of both escrow contracts to a Gnosis Safe + Timelock; track escrowed amounts and lock down `emergencyWithdraw` (finding 1).
6. Re-add the missing `require`s to `createTradeByRelayer` V2 and the `msg.value == _amount` check (findings 5-6) — needs a redeploy.
7. Tighten RLS policies (finding 8) and verify the anon key isn't shipped to the browser.
8. Add SIWE to `/wallet/connect` (finding 9).
9. Add `express-rate-limit` + `helmet` (finding 19).
10. Implement EIP-4361 / signed-cookie sessions if you want a non-Telegram web surface (finding 3).

I'd treat steps 1-4 as same-day fixes — they don't need a contract redeploy and they close the most catastrophic paths.
