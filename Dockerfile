FROM node:20-slim

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install

# Copy all source files (Invalidate Cache: 2026-02-23 V15)
COPY . .

# NUCLEAR: Force Docker to rebuild from here (change string to bust)
RUN echo "FORCE_REBUILD_MINIAPP_PATH"
WORKDIR /app/miniapp
RUN npm install --legacy-peer-deps && rm -rf dist && npx vite build && ls -la dist/assets/*.css

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server (compiled JS, not tsx — saves ~100MB RAM)
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
