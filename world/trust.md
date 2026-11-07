# Justification of Trust & Threat Model

**Project:** P2PFather — The On-Chain Escrow P2P Marketplace  
**Event:** ETHGlobal Mumbai 2026  
**Integration:** World ID (IDKit) & World App MiniKit (`@worldcoin/minikit-js`)  
**Credential Used:** World ID Proof-of-Human (Orb & Device Credentials)

---

### 1. The Specific Product Event Requiring Trust

In P2PFather, users buy and sell cryptocurrency (USDC / USDT) directly with fiat currencies (INR via UPI, IMPS, and Bank Transfers).

The specific, high-risk operational moment that demands cryptographic trust is:
1. **Posting a Public P2P Order (Merchant Creation):** When a trader creates a public buy or sell ad that other community members interact with.
2. **Entering On-Chain Escrow with Unknown Counterparties:** When smart contract escrow locks seller funds and buyer sends fiat to the counterparty's bank account.

---

### 2. The Threat Model: Mule Accounts & Cyber-Cell Bank Freezes

Peer-to-peer crypto trading in emerging markets faces an existential fraud vector:
* **The Mule Account Bot Attack:** A single criminal syndicate generates 20–50 throwaway Telegram accounts using automated bots or virtual phone numbers.
* They initiate trades using stolen victim bank accounts or compromised UPI IDs.
* Days later, cyber crime police issue Section 91 notices and freeze the innocent seller's bank account because it received tainted funds.
* Centralized exchanges attempt to solve this with mandatory government ID KYC (Aadhaar, PAN card, Passports). However:
  - Stolen IDs are readily purchased on dark web forums.
  - Storing plaintext national identity numbers creates enormous privacy risk under the Digital Personal Data Protection Act (DPDP) and GDPR.

---

### 3. Why World ID is the Minimum Sufficient Assurance

Traditional KYC asks: *"What is your legal name and passport number?"*  
In decentralized P2P trading, **that question is both intrusive and insufficient**.

What P2P escrow actually requires is:
1. **Is this trader a real living human?** (Eliminates automated scammer bots).
2. **Is this human unique?** (Sybil resistance: 1 human = 1 merchant identity).
3. **Can this trader be Sybil-rate-limited if they commit fraud?**

**World ID Proof-of-Human provides exactly this minimum sufficient assurance:**
* **Zero PII Exposure:** No biometrics, names, or government identity numbers leave the user's device or are stored in P2PFather's database.
* **Deterministic Nullifier Hashes:** The `nullifier_hash` is unique to the user's World ID and our specific action (`p2pfather-trader-verification`). If a banned scammer tries to create a secondary account, the nullifier match immediately flags and blocks them.
* **Non-Custodial Alignment:** Fits the Web3 escrow philosophy: trust the cryptographic proof, not a centralized surveillance database.

---

### 4. Alternative Paths & Graceful Fallbacks

In compliance with ETHGlobal hackathon evaluation criteria, P2PFather provides a tiered multi-path assurance matrix:

```
                  ┌──────────────────────────────────────────────┐
                  │       Trader Initiates Verification          │
                  └──────────────────────┬───────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 ▼                                               ▼
     [ Has World App with Orb ]                      [ No Orb Access / Fallback ]
                 │                                               │
                 ▼                                               ▼
      World ID Orb Credential                         World ID Device Credential
      • 100% Sybil-Proof                              • Accessible anywhere via phone
      • 0% Escrow Fees                                • Standard trade limits
      • Priority Dispute Defense                      • Alternative assurance path
                 │                                               │
                 └───────────────────────┬───────────────────────┘
                                         │
                                         ▼
                 ┌──────────────────────────────────────────────┐
                 │          Did Verification Succeed?           │
                 └───────┬──────────────────────────────┬───────┘
                         │                              │
                     [ Yes ]                         [ No ]
                         │                              │
                         ▼                              ▼
             [🌐 World ID Verified]          Graceful Fallback Paths:
             • Status: "approved"            1. Document KYC (Passport / ID)
             • Nullifier recorded            2. Unverified Standard Tier ($500 cap)
             • Sybil protection active       3. Rejection notice if nullifier duplicate
```

#### Meaningful Fallback Options:
1. **World ID Device Level:** For traders in rural or emerging regions without a physical Orb nearby, users can authenticate using their phone's secure enclave (Device Credential).
2. **Traditional Document KYC (Didit / ID):** For users who do not have World App installed, they can opt for standard document verification.
3. **Unverified Tier:** Users can still trade small amounts ($500/day limit) without any verification, preserving maximum financial inclusion.
4. **Duplicate Nullifier Rejection:** If a nullifier hash is submitted that already belongs to another registered trader, the system rejects the attempt with an explicit Sybil alert, preventing account recycling.

