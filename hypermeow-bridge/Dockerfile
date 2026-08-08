FROM golang:1.22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache gcc musl-dev sqlite-dev
COPY go.mod main.go ./
RUN go mod tidy
RUN CGO_ENABLED=1 GOOS=linux go build -o hypermeow-bridge main.go

FROM alpine:latest
WORKDIR /app
RUN apk add --no-cache ca-certificates sqlite-libs
COPY --from=builder /app/hypermeow-bridge .
EXPOSE 8081
ENV PORT=8081
CMD ["./hypermeow-bridge"]
