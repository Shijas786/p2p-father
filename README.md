# P2PFather — The First Onchain Escrow P2P Marketplace

> **Decentralized, non-custodial peer-to-peer crypto trading powered by verifiable smart contract escrow on Base & BNB Smart Chain (BSC).**

<p align="center">
  <a href="https://p2pfather.com"><img src="https://img.shields.io/badge/Live_App-p2pfather.com-00D26A?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Website"></a>
  <img src="https://img.shields.io/badge/Base-0052FF?style=for-the-badge&logo=ethereum&logoColor=white" alt="Base">
  <img src="https://img.shields.io/badge/BNB_Chain-F0B90B?style=for-the-badge&logo=binance&logoColor=black" alt="BNB Chain">
  <a href="https://t.me/p2p_fatherbot"><img src="https://img.shields.io/badge/Telegram-Bot-229ED9?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Bot"></a>
  <a href="https://t.me/P2pFather0"><img src="https://img.shields.io/badge/Telegram-Community-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram Community"></a>
  <a href="https://www.instagram.com/p2p.father/"><img src="https://img.shields.io/badge/Instagram-@p2p.father-E4405F?style=for-the-badge&logo=instagram&logoColor=white" alt="Instagram"></a>
</p>

---

## 💡 The Problem & The Solution

- **The Problem:** Traditional centralized P2P exchanges (CEXs) frequently subject traders to frozen bank accounts, fraudulent third-party fiat payments, and sudden account bans.
- **The Solution:** P2PFather secures peer-to-peer trades using **on-chain smart contracts**. Crypto stays locked safely in the smart contract escrow until the seller confirms fiat receipt, eliminating centralized exchange risk.

---

## ⚡ Key Features

- 🔒 **On-Chain Escrow**: Real EVM smart contracts (`P2PEscrow.sol` / `P2PEscrow_V2.sol`) hold seller funds safely on Base and BSC.
- 📱 **Telegram MiniApp & Web App**: Trade directly inside Telegram with zero installation, or use the web app at [p2pfather.com](https://p2pfather.com).
- ⚖️ **Admin-Mediated Disputes**: If a payment issue occurs, a 3-way live dispute room allows buyer and seller to provide payment receipts while platform admins review proof to release or refund funds.
- 🚀 **Multi-Chain Support**: Trade seamlessly on Base (with 0% protocol fee routing) and BNB Smart Chain (BSC).
- 💼 **Flexible Wallets**: Supports integrated non-custodial/custodial HD wallet derivation as well as connecting external Web3 wallets (MetaMask, Coinbase Wallet, etc.).

---

## 📜 Deployed Contracts

| Network | Contract | Address | Explorer |
| :--- | :--- | :--- | :--- |
| **BNB Chain (BSC Mainnet)** | Escrow V2 | `0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a` | [View on BscScan](https://bscscan.com/address/0x9F4Ab356cF973a6A5ad7D5A826d04e29861c502a) |
| **Base (Mainnet)** | Escrow Contract | `0xf20872C359788a53958a048413D64F183403B1f1` | [View on BaseScan](https://basescan.org/address/0xf20872C359788a53958a048413D64F183403B1f1) |

---

## 🏗️ How Trading Works

```
1. Seller creates order & deposits crypto into Smart Contract Escrow
2. Buyer initiates trade & transfers fiat directly to Seller (UPI / Bank)
3. Seller confirms receipt of fiat payment
4. Smart Contract automatically releases crypto to Buyer
   (If any issue arises, Admin steps into the 3-way dispute chat to review proof & resolve)
```

---

## 💻 Tech Stack

- **Smart Contracts:** Solidity (`^0.8.20`), Hardhat, OpenZeppelin
- **Frontend:** React 18, Vite, Wagmi, Viem, Web3Modal
- **Backend & Bot:** Node.js, TypeScript, Express, grammY (Telegram SDK)
- **Database & Cache:** Supabase (PostgreSQL), Redis

---

## 🚀 Running Locally

### 1. Clone the Repository
```bash
git clone https://github.com/Shijas786/p2p-father.git
cd p2p-father
```

### 2. Install Dependencies
```bash
# Install backend dependencies
npm install

# Install Mini App frontend dependencies
npm --prefix miniapp install
```

### 3. Setup Environment Configuration
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

### 4. Run Development Servers
```bash
# Start backend and bot in development mode (with hot-reload)
npm run dev

# In a separate terminal, start the Mini App frontend
npm --prefix miniapp run dev
```

### 5. Compile & Build for Production
```bash
# Build backend
npm run build

# Build Mini App
npm --prefix miniapp run build
```

---

## 👥 Community & Links

- **Website:** [https://p2pfather.com](https://p2pfather.com)
- **Telegram Bot:** [@p2p_fatherbot](https://t.me/p2p_fatherbot)
- **Telegram Community:** [Join Community Group](https://t.me/P2pFather0)
- **Instagram:** [@p2p.father](https://www.instagram.com/p2p.father/)
- **License:** [MIT](LICENSE)
