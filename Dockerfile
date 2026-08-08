FROM node:22-bookworm

# 1. Install system tools & Go 1.22 compiler
RUN apt-get update && apt-get install -y gcc g++ make sqlite3 libsqlite3-dev ca-certificates wget tar && rm -rf /var/lib/apt/lists/*
RUN wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz && tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz && rm go1.22.5.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app

# 2. Install main project npm dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 3. Copy full codebase
COPY . .

# 4. Build Go Hypermeow bridge
WORKDIR /app/hypermeow-bridge
RUN rm -f go.mod go.sum && go mod init hypermeow-bridge && go get go.mau.fi/whatsmeow@v0.0.0-20260806224404-e277b766ab33 && go get github.com/mattn/go-sqlite3 && go get google.golang.org/protobuf && go mod tidy && CGO_ENABLED=1 go build -o hypermeow-bridge main.go

# 5. Build miniapp
WORKDIR /app/miniapp
RUN rm -rf node_modules package-lock.json && npm install --legacy-peer-deps
RUN npm run build

# 6. Build backend Express app
WORKDIR /app
RUN npm run build
RUN chmod +x start.sh

EXPOSE 8000
CMD ["/bin/sh", "/app/start.sh"]


