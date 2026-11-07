# World Developer Friction & Feedback Report

**Project:** P2PFather — The On-Chain Escrow P2P Marketplace  
**Event:** ETHGlobal Mumbai 2026  
**Integration:** `@worldcoin/minikit-js` (v2.0.3) & World Developer Portal API v2  
**Action:** `p2pfather-trader-verification`

---

### Executive Summary
Integrating World ID Proof-of-Human into P2PFather took approximately **45 minutes**. The developer documentation for Developer Portal API v2 (`https://developer.worldcoin.org/api/v2/verify`) is clean and easy to invoke from any backend. 

Below is constructive feedback on friction points encountered while integrating MiniKit with a full-stack Node/Express and HTML5 architecture.

---

### 1. Next.js Assumptions in MiniKit Documentation
* **Observed Friction:**  
  Most official examples, quickstarts, and sample repositories for MiniKit (`@worldcoin/minikit-js`) assume a Next.js (App Router) environment with React hooks (`useMiniKit`, `MiniKitProvider`).  
  For projects using standalone Express, vanilla TypeScript, or Telegram MiniApp webviews that also run inside World App, developers must reverse-engineer the imperative `MiniKit.commandsAsync.verify()` and `MiniKit.install()` calls.
* **Recommendation:**  
  Add an official "Vanilla JS / Multi-Platform" tab in the MiniKit docs showing pure JavaScript/HTML integration without React or Next.js wrappers.

---

### 2. Sandbox / Staging Simulator Friction for Team Testing
* **Observed Friction:**  
  When testing the verification flow on localhost or in automated CI/CD pipelines, calling the live developer portal requires either:
  1. A real physical Orb scan with a test wallet.
  2. The World App simulator with a QR bridge.
  When testing edge cases (e.g. Sybil duplicate nullifier rejection or network timeout fallbacks), generating deterministic simulated proofs via an official npm mock helper would accelerate testing.
* **Recommendation:**  
  Provide a `@worldcoin/idkit-mock` or `MiniKit.mockVerify()` utility for CI/CD test suites that outputs a validly structured mock ZK-nullifier payload for staging apps (`app_staging_*`).

---

### 3. Dual-Environment App Detection
* **Observed Friction:**  
  When a web app is accessed outside the World App webview (e.g. via a standard Safari, Chrome, or Telegram in-app browser), `MiniKit.isInstalled()` throws or silently returns false.
* **Recommendation:**  
  Provide a standardized fallback helper in the SDK (e.g. `MiniKit.openInWorldApp(universalLink)`) so non-World App users are smoothly redirected to their mobile World App with the action pre-filled.

---

### 4. SDK Strengths
* **Developer Portal Dashboard:** The World Developer Portal is fast and intuitive. Creating staging apps and configuring actions took less than 2 minutes.
* **Clean Cryptographic Payload:** Returning explicit `nullifier_hash`, `merkle_root`, and `verification_level` made storing Sybil records straightforward without requiring custom decoding.

