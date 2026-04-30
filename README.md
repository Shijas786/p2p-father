# P2PFather — Telegram P2P Crypto Exchange

**P2PFather** is a fully-featured, decentralized P2P Crypto Exchange platform built directly on top of Telegram. It leverages Telegram Bots and Mini Apps to provide users with a seamless, intuitive, and secure peer-to-peer trading experience powered by smart contracts.

## 🌟 Key Features

* **Telegram Integration**: Full integration with Telegram via the `@grammyjs` framework for conversational trading.
* **Mini App Frontend**: A responsive, rich UI inside Telegram for managing ads, orders, and user profiles.
* **Smart Contract Escrow**: Secure, on-chain escrow services built with Solidity and Hardhat, integrating directly with Ethereum/EVM-compatible chains via `ethers.js`.
* **Advanced Dispute System**: A 3-way live dispute resolution chat connecting the buyer, seller, and platform admins, including role-based access and system messages.
* **Automated Ad Management**: Automated cleanup of Telegram broadcast messages for expired and cancelled trades via robust background jobs.
* **Real-time Infrastructure**: Powered by Supabase (PostgreSQL) and Redis for high-performance caching and live updates.

## 🏗️ Architecture & Tech Stack

* **Language**: TypeScript / Node.js
* **Bot Framework**: grammY (`@grammyjs/conversations`, `grammy`)
* **API/Backend**: Express.js
* **Database**: Supabase (PostgreSQL)
* **Blockchain/Web3**: Hardhat, Ethers.js, OpenZeppelin
* **Caching/Queues**: Redis (`ioredis`)
* **Deployment**: Configured for Railway and Vercel

## 🚀 Deployment

This project is configured for automated deployment. Simply push your changes to the `main` branch, and the server (Railway/Docker) will automatically build both the backend and the Mini App frontend.

### Environment Variables
Refer to `.env.example` for the required configuration parameters, which include:
* Telegram Bot Token
* Supabase URL & Service Role Keys
* Redis Connection Strings
* Web3 RPC URLs and Private Keys

## 🛠️ Database Updates & Migrations

When making schema changes, always remember to apply the SQL migrations manually in the Supabase SQL Editor as documented in the implementation plans and `supabase/migrations/` directory.

## 📜 Commands

* `npm run dev`: Start the development server with live reload (`tsx watch`).
* `npm run build`: Compile TypeScript into the `dist/` folder.
* `npm start`: Start the bot and express server in production.

---

*Built for secure, fast, and accessible crypto trading on Telegram.*
