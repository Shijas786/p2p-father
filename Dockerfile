FROM node:22-bookworm

# Install build tools & Go 1.22 official compiler binary
RUN apt-get update && apt-get install -y gcc g++ make sqlite3 libsqlite3-dev ca-certificates wget tar && rm -rf /var/lib/apt/lists/*
RUN wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz && tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz && rm go1.22.5.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app

# Install dependencies for main project
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy everything else
COPY . .

# Build Go Hypermeow bridge with go mod tidy
WORKDIR /app/hypermeow-bridge
RUN rm -f go.mod go.sum && go mod init hypermeow-bridge && go get go.mau.fi/whatsmeow && go get github.com/mattn/go-sqlite3 && go get google.golang.org/protobuf && go mod tidy && CGO_ENABLED=1 go build -o hypermeow-bridge main.go

# Build the miniapp
WORKDIR /app/miniapp
RUN rm -rf node_modules package-lock.json && npm install --legacy-peer-deps
RUN npm run build

# Build the backend
WORKDIR /app
RUN npm run build
RUN chmod +x start.sh

# Expose main Express port for Railway routing
EXPOSE 8000

# Start both Go Hypermeow bridge and Node.js backend
CMD ["/bin/sh", "/app/start.sh"]
