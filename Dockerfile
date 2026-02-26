FROM node:20-slim

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Build miniapp from scratch
WORKDIR /app/miniapp
RUN npm install --legacy-peer-deps && npx vite build && ls -la dist/assets/*.css

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
