FROM node:20

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy everything else (leveraging dockerignore)
COPY . .

# Build the miniapp
WORKDIR /app/miniapp
RUN rm -rf node_modules package-lock.json && npm install --legacy-peer-deps
RUN npm run build

# Build the backend
WORKDIR /app
RUN npm run build

# Expose port
EXPOSE 8000

# Start the server
CMD ["node", "--max-old-space-size=384", "dist/index.js"]
