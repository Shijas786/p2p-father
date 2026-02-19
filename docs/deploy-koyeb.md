# 🚀 Koyeb Deployment Guide — P2P Kerala Bot

Follow these steps to deploy your Telegram bot to Koyeb and keep it running 24/7 for free.

## 1. Prepare your Code
Ensure you have already committed and pushed your latest code to a **GitHub Repository**. 
*I have already created a `Dockerfile` and `.dockerignore` in your project to make Koyeb detection automatic.*

---

## 2. Set up Koyeb
1.  **Sign Up**: Go to [koyeb.com](https://www.koyeb.com/) and create a free account.
2.  **Create Service**:
    *   Click **"Create Service"**.
    *   Select **GitHub** as the deployment method.
    *   Connect your GitHub account and select the `p2pkerala` repository.

---

## 3. Configuration (Crucial!)
In the Koyeb configuration screen, set the following:

### **A. Instance Type**
*   Select the **"Nano"** instance (it's the free one).

### **B. Environment Variables**
Scroll down to the **"Environment Variables"** section and add all the keys from your local `.env` file. Do **NOT** skip these, or the bot won't start.

| Key | Value (Copy from your .env) |
| :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | *Your Token* |
| `SUPABASE_URL` | *Your URL* |
| `SUPABASE_SERVICE_KEY` | *Your Key* |
| `ESCROW_CONTRACT_ADDRESS` | `0xe9B4936673BDa2F4899225A0a82E2fdAF456eCA6` |
| `ADMIN_WALLET_ADDRESS` | `0x3A5668F8B3E167771d503F0321c42a7B082789Ef` |
| `RELAYER_PRIVATE_KEY` | *Your Private Key* |
| `MASTER_WALLET_SEED` | *Your 12-word Seed* |
| `BASE_RPC_URL` | `https://mainnet.base.org` |
| `OPENAI_API_KEY` | *Your Key* |
| `USDC_ADDRESS` | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `FEE_BPS` | `50` |
| `NODE_ENV` | `production` |

### **C. Run Command**
Koyeb should detect the `Dockerfile` automatically. If it asks:
*   **Protocol**: Keep it as default (HTTP).
*   **Port**: You can disable the health check port or set it to `8000` (The bot doesn't actually use a web port, so if Koyeb complains about health checks, you may need to add a dummy port in the code).

---

## 4. Deploy 🚀
1.  Click **"Deploy"**.
2.  Wait for the build to finish (usually 2-3 minutes).
3.  Once the status turns **"Healthy"**, your bot is live!

---

## 💡 Pro-Tip: Making Health Checks Pass
Koyeb (and other clouds) often expect a web page to be accessible to prove the app is "alive." Since a bot just runs in the background, Koyeb might show a "Health Check Failed" error.

**If that happens, let me know.** I can add 5 lines of code to create a simple "I am alive" web page that will make Koyeb happy.
