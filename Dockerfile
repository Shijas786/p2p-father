FROM node:20-slim

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install

# Copy all source files (Invalidate Cache: 2026-02-23 V13)
COPY . .

# Build Version: V13 (Market News Feature)
WORKDIR /app/miniapp
RUN npm install --legacy-peer-deps
RUN npx vite build

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server
CMD ["npm", "run", "start"]
