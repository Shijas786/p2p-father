FROM node:20-slim

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install

# Copy all source files (Invalidate Cache: 2026-02-26 V17.0 NUCLEAR)
COPY . .

# ═══════════════════════════════════════════════════════════
# NUCLEAR CACHE BUST — Change this string to force full rebuild
# ═══════════════════════════════════════════════════════════
RUN echo "NUCLEAR_FRESH_BUILD_20260226_V3_$(date +%s)"

# Clean everything and rebuild miniapp from scratch
WORKDIR /app/miniapp
RUN rm -rf node_modules dist .vite package-lock.json && \
    npm cache clean --force && \
    npm install --legacy-peer-deps --prefer-offline=false && \
    npx vite build && \
    ls -la dist/assets/*.css

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server (compiled JS, not tsx — saves ~100MB RAM)
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
