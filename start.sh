#!/bin/sh

export HYPERMEOW_PORT=8085
export HYPERMEOW_URL=http://localhost:8085

echo "[Launcher] Starting Go Hypermeow Bridge on port 8085..."
cd /app/hypermeow-bridge
./hypermeow-bridge &

sleep 2

echo "[Launcher] Starting P2PFather Node.js Server on port ${PORT:-8000}..."
cd /app
exec node --max-old-space-size=384 dist/index.js
