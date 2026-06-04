export type WsTradeEvent = {
    event_type: 'trade';
    status: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED';
    asset_id: string;
    size: string;
    side: 'BUY' | 'SELL';
    outcome: string;
    market: string;
    price: string;
    timestamp: number;
};

export type WsPositionState = {
    asset: string;
    outcome: string;
    size: number;
    side: 'BUY' | 'SELL';
    status: 'MATCHED' | 'CONFIRMED';
    market: string;
    price: number;
};

class PolymarketWsClient {
    private ws: WebSocket | null = null;
    private pingInterval: any = null;
    private positionListeners: Set<(positions: WsPositionState[]) => void> = new Set();
    private localPositions: Record<string, WsPositionState> = {}; // key: asset_id
    private credentials: { apiKey: string; secret: string; passphrase: string } | null = null;

    connect(apiKey: string, secret: string, passphrase: string) {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return; // Already connected
        }

        this.credentials = { apiKey, secret, passphrase };
        this.ws = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/user');

        this.ws.onopen = () => {
            console.log('[Polymarket WS] Connected to user channel');
            
            // Authenticate
            this.ws?.send(JSON.stringify({
                type: 'user',
                auth: { apiKey, secret, passphrase }
            }));

            // Keep alive
            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send('PING');
                }
            }, 10000);
        };

        this.ws.onmessage = (event) => {
            if (event.data === 'PONG') return;
            try {
                const msg = JSON.parse(event.data);
                
                if (msg.event_type === 'trade') {
                    this.handleTradeEvent(msg as WsTradeEvent);
                }
            } catch (e) {
                console.warn('[Polymarket WS] Message parsing error:', e);
            }
        };

        this.ws.onerror = (err) => {
            console.error('[Polymarket WS] Error:', err);
        };

        this.ws.onclose = () => {
            console.log('[Polymarket WS] Disconnected');
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.ws = null;
            // Attempt reconnect after 5s if we still have credentials
            if (this.credentials) {
                setTimeout(() => {
                    if (this.credentials) {
                        this.connect(this.credentials.apiKey, this.credentials.secret, this.credentials.passphrase);
                    }
                }, 5000);
            }
        };
    }

    disconnect() {
        this.credentials = null; // Prevent reconnect
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.pingInterval) clearInterval(this.pingInterval);
    }

    private handleTradeEvent(msg: WsTradeEvent) {
        if (msg.status === 'MATCHED' || msg.status === 'CONFIRMED') {
            const assetLc = msg.asset_id.toLowerCase();
            const current = this.localPositions[assetLc] || {
                asset: assetLc,
                outcome: msg.outcome,
                size: 0,
                side: msg.side,
                status: msg.status,
                market: msg.market,
                price: parseFloat(msg.price)
            };

            const sizeFloat = parseFloat(msg.size);
            if (msg.side === 'BUY') {
                current.size += sizeFloat;
            } else if (msg.side === 'SELL') {
                current.size -= sizeFloat;
                if (current.size < 0) current.size = 0;
            }

            // Upgrade status if it was MATCHED and now CONFIRMED
            if (msg.status === 'CONFIRMED') {
                current.status = 'CONFIRMED';
            }

            this.localPositions[assetLc] = current;
            this.notifyListeners();
        }
    }

    // Helper for optimistic UI updates (before MATCHED event arrives)
    optimisticBuy(asset_id: string, outcome: string, size: number, price: number, market: string) {
        const assetLc = asset_id.toLowerCase();
        const current = this.localPositions[assetLc] || {
            asset: assetLc,
            outcome,
            size: 0,
            side: 'BUY',
            status: 'MATCHED', // treat optimistic as matched temporarily
            market,
            price
        };
        current.size += size;
        this.localPositions[assetLc] = current;
        this.notifyListeners();
    }

    optimisticSell(asset_id: string, size: number) {
        const assetLc = asset_id.toLowerCase();
        if (this.localPositions[assetLc]) {
            this.localPositions[assetLc].size -= size;
            if (this.localPositions[assetLc].size < 0) {
                this.localPositions[assetLc].size = 0;
            }
            this.notifyListeners();
        }
    }

    getPositions() {
        return Object.values(this.localPositions).filter(p => p.size > 0.001);
    }

    // Called when the backend Data API catches up, to avoid double-counting
    syncWithBackend(backendOutcomes: string[]) {
        let changed = false;
        for (const outcome of backendOutcomes) {
            for (const assetLc in this.localPositions) {
                if (this.localPositions[assetLc].outcome === outcome) {
                    delete this.localPositions[assetLc];
                    changed = true;
                }
            }
        }
        if (changed) this.notifyListeners();
    }

    subscribe(listener: (positions: WsPositionState[]) => void) {
        this.positionListeners.add(listener);
        return () => this.positionListeners.delete(listener);
    }

    private notifyListeners() {
        const positions = this.getPositions();
        for (const listener of this.positionListeners) {
            listener(positions);
        }
    }
}

export const polymarketWs = new PolymarketWsClient();
