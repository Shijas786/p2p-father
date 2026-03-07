FROM node:20-slim

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install

# Copy all source files
COPY . .

# Miniapp is pre-built and synced to public/app in Git, skipping Vite build to save memory

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
