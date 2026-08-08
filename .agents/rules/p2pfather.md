---
trigger: always_on
---

# P2P Father — Production Safety Rules

P2P Father is a LIVE production platform with REAL USERS and REAL FUNDS.

Treat every change as a production-critical change.

## 🚨 Production Safety — Highest Priority

- Assume the application is actively being used by real users at all times.
- Assume real money, trades, balances, escrow, wallets, KYC data, and user activity are involved.
- NEVER make a change casually or experimentally.
- NEVER break existing functionality just to implement a new feature.
- NEVER assume something is safe without checking the existing implementation first.
- ALWAYS understand how a change affects the rest of the system before modifying code.
- ALWAYS prioritize protecting existing users and funds over adding new functionality.

## Before Making ANY Change

1. Inspect the existing implementation carefully.
2. Understand the current flow and dependencies.
3. Check how the change interacts with existing features.
4. Identify possible side effects and edge cases.
5. Check whether existing users, trades, balances, escrow, authentication, KYC, payments, or bots could be affected.
6. Prefer the smallest and safest change possible.
7. Do not rewrite or refactor unrelated code.
8. If there is uncertainty about a potentially dangerous change, STOP and explain the risk before proceeding.

## Cross-Check Everything

Before finalizing a change, cross-check:

- Existing API behavior
- Database queries and schema
- Authentication and authorization
- Wallet and escrow logic
- Transaction/trade flows
- User balances
- KYC/verification flows
- Telegram Mini App behavior
- Telegram bot behavior
- WhatsApp/Hypermeow integration
- Background jobs
- Webhooks
- External APIs
- Environment variables
- Production deployment configuration

Do not assume that changing one component only affects that component.

## Money & Financial Logic

This is especially sensitive.

- NEVER modify transaction, escrow, wallet, balance, fee, settlement, or payment logic without carefully tracing the complete flow.
- NEVER introduce changes that could duplicate, lose, lock, or incorrectly credit funds.
- NEVER change financial calculations without verifying the existing behavior.
- Preserve existing transaction safety and idempotency.
- Be extremely careful with asynchronous jobs, retries, webhooks, and duplicate events.

## Database

- NEVER casually modify production database schemas.
- NEVER delete or migrate data without understanding the consequences.
- NEVER change existing fields or queries without checking all usages.
- Preserve backward compatibility whenever possible.
- Avoid destructive migrations.
- Never assume test data represents production data.

## Existing Functionality

Before adding something new:

- Check whether similar functionality already exists.
- Reuse existing utilities and patterns when appropriate.
- Do not create duplicate systems unnecessarily.
- Do not remove existing behavior unless explicitly required.
- Do not replace working code with a new implementation just because it looks cleaner.

## AI Usage

Use AI only when it provides meaningful value.

For simple deterministic tasks, prefer:
- Normal code
- Conditions
- Rules
- Regex
- Database queries
- Predefined responses

Use AI for:
- Natural-language understanding
- Ambiguous user messages
- Classification
- Complex conversational situations
- Cases where deterministic logic is insufficient

Minimize unnecessary AI calls, latency, and API costs.

## Testing & Verification

After making a change:

1. Build the affected components.
2. Run relevant tests/checks.
3. Check for compilation errors.
4. Review logs for unexpected behavior.
5. Verify that existing functionality still works.
6. Check for unintended side effects.
7. Only then consider the change production-ready.

If testing cannot fully verify something, explicitly state what remains unverified.

## Deployment

- NEVER assume a successful build means the change is safe.
- Never expose secrets, API keys, private keys, tokens, or credentials.
- Do not modify production environment variables unless explicitly required.
- Be careful with deployment configuration and startup behavior.
- Avoid changes that could cause downtime or restart loops.
- Prefer incremental, reversible changes.

## Debugging Production Issues

When debugging:

- Find the ROOT CAUSE before changing code.
- Read the relevant logs carefully.
- Do not blindly patch errors.
- Do not hide errors with silent fallbacks.
- Do not disable security/authentication just to make something work.
- Check whether the issue is caused by an external dependency, API, protocol, deployment, or existing code before rewriting functionality.

## Communication

Before making a risky change, clearly explain:

- What is currently happening
- What is causing the problem
- What you plan to change
- What could potentially be affected
- How you will verify the change

When finished, clearly report:

- What changed
- Why it changed
- What was tested
- Any remaining risks or things that could not be verified

## Golden Rule

When working on P2P Father:

DO NOT think "How can I make this work?"

Think:

"How can I make this work WITHOUT breaking anything that is already working for our live users or putting their funds/data at risk?"

When in doubt, inspect more, cross-check more, and change less.