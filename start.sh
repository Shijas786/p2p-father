#!/bin/sh

echo "[Launcher] Starting Go Hypermeow Bridge on port 8081..."
cd /app/hypermeow-bridge
./hypermeow-bridge &

sleep 2

echo "[Launcher] Starting P2PFather Node.js Server..."
cd /app
exec node --max-old-space-size=384 dist/index.js
