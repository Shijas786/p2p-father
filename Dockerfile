FROM node:22-bookworm

# 1. Install system tools & Go 1.22 compiler
RUN apt-get update && apt-get install -y gcc g++ make sqlite3 libsqlite3-dev ca-certificates wget tar && rm -rf /var/lib/apt/lists/*
RUN wget -q https://go.dev/dl/go1.22.5.linux-amd64.tar.gz && tar -C /usr/local -xzf go1.22.5.linux-amd64.tar.gz && rm go1.22.5.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /app

# 2. Cache main project npm dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# 3. Cache miniapp npm dependencies
WORKDIR /app/miniapp
COPY miniapp/package*.json ./
RUN npm install --legacy-peer-deps

# 4. Cache Go bridge module dependencies
WORKDIR /app/hypermeow-bridge
RUN go mod init hypermeow-bridge || true
RUN go get go.mau.fi/whatsmeow@v0.0.0-20260806224404-e277b766ab33 github.com/mattn/go-sqlite3 google.golang.org/protobuf && go mod tidy

# 5. Copy full codebase (changes below this line won't re-download dependencies!)
WORKDIR /app
COPY . .

# 6. Build binaries & bundles
WORKDIR /app/hypermeow-bridge
RUN CGO_ENABLED=1 go build -o hypermeow-bridge main.go

WORKDIR /app/miniapp
RUN npm run build

WORKDIR /app
RUN npm run build
RUN chmod +x start.sh

EXPOSE 8000
CMD ["/bin/sh", "/app/start.sh"]

