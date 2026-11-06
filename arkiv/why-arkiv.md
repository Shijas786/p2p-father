# Why Arkiv: Why Decentralized DB-Chain Beats Postgres

**Project:** P2PFather — The On-Chain Escrow P2P Marketplace  
**Datasets on Arkiv:** `p2pfather.dispute_dossier`, `p2pfather.fraud_blacklist`, `p2pfather.trader_reputation`

---

### The Fundamental Flaw of Traditional Databases for P2P Disputes & Risk

Traditional centralized databases (PostgreSQL, Supabase, MySQL) are ideal for private operational data like user sessions, hashed passwords, and internal order matching. However, for **P2P dispute adjudication, counterparty trust, and fraud blacklists**, centralized databases fail in critical ways:

---

### 1. Privacy-Preserving Cryptographic Commitments (Solving the PII Problem)
* **The Dilemma:**  
  In peer-to-peer trading disputes, buyers and sellers upload bank statements, UPI references, and UTR payment receipts. Writing raw bank account numbers and physical receipts to a public blockchain violates banking confidentiality and global privacy laws (GDPR/DPDP).
* **The Arkiv Solution:**  
  P2PFather implements a **Cryptographic Evidence Commitment Scheme**:
  - The raw bank receipts and UTR numbers remain private between the trader and mediator.
  - The cryptographic **SHA-256 hash** of the evidence is committed immutably to the **Arkiv DB-Chain (`p2pfather.dispute_dossier`)** alongside the mediator's verdict.
  - When a trader faces bank freezes or police scrutiny, they present their raw receipt. The regulatory officer or bank verifies that `SHA-256(receipt)` matches the immutable on-chain hash recorded on Arkiv at the exact minute of mediation.

---

### 2. Legal Adjudication & Tamper-Proof Audit Trail
* **In PostgreSQL / Supabase:**  
  A single database administrator, compromised server, or rogue employee can modify or delete dispute records:
  ```sql
  UPDATE p2p_disputes SET verdict = 'RELEASED_TO_BUYER' WHERE id = '...';
  ```
  Scammers frequently attempt to socially engineer or bribe exchange support agents to alter dispute outcomes or wipe scam records.
* **On Arkiv:**  
  Entities are cryptographically signed by authorized mediator wallets and stored across an immutable DB-chain. Once a dispute verdict is written with an on-chain transaction hash, it cannot be altered or wiped without an auditable trail.

---

### 3. Open Verification for Law Enforcement & Banks
* **In PostgreSQL:**  
  Data is locked behind private backend servers. When a cyber crime unit or bank freezes a trader's account, they cannot independently verify whether a P2P trade was legitimate without filing slow sub-poenas with centralized exchange compliance desks.
* **On Arkiv:**  
  Anyone—including bank fraud departments, external escrow protocols, and cyber cells—can verify the cryptographic dispute dossier directly on the Rabdi DB-Chain without needing API keys, platform permissions, or central server dependencies.

---

### 4. Built-in Time-Scoped Expirations
* **In PostgreSQL:**  
  Managing temporary risk probation or decaying reputation requires scheduled cron jobs, background workers, and manual database cleanups.
* **On Arkiv:**  
  Entities have native blockchain expiration primitives (`ExpirationTime.fromDays(365)`). Dispute dossiers and temporary flags maintain exact legal lifetimes automatically on-chain.

---

### Conclusion
PostgreSQL powers P2PFather's private backend operations. **Arkiv elevates our dispute adjudication and reputation registry into a privacy-preserving, tamper-proof, censorship-resistant public audit layer for the entire Web3 ecosystem.**
