# Arkiv Developer Friction & Feedback Report

**Project:** P2PFather — The On-Chain Escrow P2P Marketplace  
**Event:** ETHGlobal Mumbai 2026  
**Integration:** `@arkiv-network/sdk` on Rabdi Testnet (`Chain ID: 7794095`)

---

### Executive Summary
Building on Arkiv to implement our **P2P Counterparty Risk & Reputation Registry** was remarkably fast. Extending `viem`'s familiar client paradigms (`createPublicClient` and `createWalletClient`) allowed us to integrate decentralized querying in under an hour without writing complex smart contract indexing infrastructure.

Below is detailed, constructive feedback on areas of friction we encountered during implementation and suggestions for the Arkiv core team.

---

### 1. Dual CommonJS/ESM TypeScript Definition Mismatch
* **Observed Friction:**  
  In a TypeScript project using `"module": "commonjs"` and `"moduleResolution": "node"`, importing `defineSchema`, `addr` from `@arkiv-network/sdk/schema` and `eq` from `@arkiv-network/sdk/query` caused type-checker errors:
  ```
  Type 'ComparisonNode<ValueRef<"traderAddress", AddrValue>>' is not assignable to type 'Expression'.
  Property '[validated]' is missing in type '...dist/index-DaMIgZgJ' but required in type '...dist/index-DfPlTdS7'
  ```
  This occurs because the SDK's package exports resolve `.d.cts` for the root export and `.d.ts` for subpaths, generating incompatible nominal branded types for internal validation tags.
* **Recommendation:**  
  Harmonize type definitions in `package.json` with explicit `"types"` condition mapping across all sub-exports (`./schema`, `./query`, `./chains`) to ensure consistent branded type validation across both ESM and CJS consumers.

---

### 2. Gas Error Reporting on Rabdi Testnet
* **Observed Friction:**  
  When an account without `tGLM` gas tokens calls `walletClient.createEntity()`, the node returns:
  ```
  Wallet error: Transaction failed: Execution error without revert data
  ```
  This makes it ambiguous whether the issue is a schema validation failure, invalid salt, or simply an empty gas balance.
* **Recommendation:**  
  Surface an explicit `InsufficientBalanceError` or pre-flight balance check in `@arkiv-network/sdk` before submitting the transaction, clearly pointing developers to the Rabdi faucet.

---

### 3. Programmatic Faucet API via Access Keys
* **Observed Friction:**  
  Claiming testnet `tGLM` requires navigating the Web Hub UI (`hub.arkiv.network/faucet`). For automated CI/CD test suites or backend bots running ingestion scripts, manual captcha/web faucets slow down developer velocity.
* **Recommendation:**  
  Allow authenticated developer access keys (`ark_live_...`) to request initial testnet drip credits programmatically via an RPC or SDK helper (e.g. `client.requestTestnetDrip()`).

---

### 4. SDK Strengths
* **Query Builder Experience:** The `.select().from().where().fetch()` syntax is intuitive, predictable, and feels like native ORM code.
* **Built-in Expiration Lifecycles:** Having native `ExpirationTime` directly in entity creation eliminates the need for manual cron jobs or database garbage collection for stale records.

