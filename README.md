# P2PFather — Telegram P2P Crypto Exchange

## 🚀 Deployment Workflow (IMPORTANT)

This project is configured to skip the Mini App build on the server (Railway/Docker) to save memory. All Mini App changes **must be pre-built and synchronized** before pushing to `main`.

### Steps to Deploy Frontend Changes:
1.  **Build locally**: 
    ```bash
    cd miniapp && npm run build
    ```
2.  **Sync to Public**: 
    Remove old files and copy new build to the root `/public/app` directory:
    ```bash
    rm -rf public/app/* && cp -r miniapp/dist/* public/app/
    ```
3.  **Push to Git**:
    ```bash
    git add . && git commit -m "..." && git push origin main
    ```

---

## 🛠️ Database Updates
When making schema changes, always remember to apply the SQL migration manually in the Supabase SQL Editor as documented in the implementation plans.
