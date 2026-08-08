FROM node:22-bookworm

# Install Go compiler & SQLite build dependencies
RUN apt-get update && apt-get install -y golang gcc g++ make sqlite3 libsqlite3-dev ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy everything else
COPY . .

# Build Go Hypermeow bridge
WORKDIR /app/hypermeow-bridge
RUN go mod tidy && CGO_ENABLED=1 go build -o hypermeow-bridge main.go

# Build the miniapp
WORKDIR /app/miniapp
RUN rm -rf node_modules package-lock.json && npm install --legacy-peer-deps
RUN npm run build

# Build the backend
WORKDIR /app
RUN npm run build
RUN chmod +x start.sh

# Expose ports
EXPOSE 8000 8081

# Start both Go Hypermeow bridge and Node.js backend
CMD ["/bin/sh", "/app/start.sh"]
