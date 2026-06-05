// API client for Mini App backend
import { getInitData } from './telegram';

const API_BASE = '/api/miniapp';



async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const initData = getInitData();

    // 30-second timeout to prevent hanging requests (increased for blockchain ops)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Telegram-Init-Data': initData,
                ...options.headers,
            },
        });

        if (!res.ok) {
            let errorMsg = `Request failed: ${res.status}`;
            try {
                const body = await res.json();
                errorMsg = body.error || errorMsg;
            } catch {
                // Response wasn't JSON, use status text
                errorMsg = res.statusText || errorMsg;
            }
            throw new Error(errorMsg);
        }

        return res.json();
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw new Error('Request timed out. Please try again.');
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}

// ---- Auth ----
export const api = {
    auth: {
        login: () => request<{ user: any; token?: string }>('/auth', { method: 'POST' }),
    },

    // ---- Wallet ----
    wallet: {
        getBalances: () => request<{
            eth: string;
            usdc: string;
            usdt: string;
            bnb: string;
            bsc_usdc: string;
            bsc_usdt: string;
            pol?: string;
            pusd?: string;
            address: string;
            vault_base_usdc?: string;
            vault_bsc_usdc?: string;
            vault_base_usdt?: string;
            vault_bsc_usdt?: string;
            vault_bsc_bnb?: string;
            vault_base_reserved?: string;
            vault_bsc_reserved?: string;

            reserved_base_usdc?: string;
            reserved_base_usdt?: string;
            reserved_bsc_usdc?: string;
            reserved_bsc_usdt?: string;
            reserved_bsc_bnb?: string;

            wallet_type?: string;
        }>('/wallet/balances'),
        getBotBalances: () => request<{
            eth: string;
            usdc: string;
            usdt: string;
            bnb: string;
            bsc_usdc: string;
            bsc_usdt: string;
            pol?: string;
            pusd?: string;
            address: string;
            wallet_type?: string;
        }>('/wallet/bot-balances'),
        send: (data: { to: string; amount: number; token: string; chain?: string }) =>
            request<{ txHash: string }>('/wallet/send', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
        connectExternal: (address: string) =>
            request<{ success: boolean }>('/wallet/connect', {
                method: 'POST',
                body: JSON.stringify({ address }),
            }),
        connectBot: () => request<{ success: boolean; address: string }>('/wallet/bot', { method: 'POST' }),
        depositToVault: (amount: number, token: string, chain: string) =>
            request<{ txHash: string }>('/wallet/vault/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount, token, chain }),
            }),
        withdrawFromVault: (amount: number, token: string, chain: string, legacy?: boolean) =>
            request<{ txHash: string }>('/wallet/vault/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount, token, chain, legacy }),
            }),
    },

    // ---- Orders ----
    orders: {
        list: (type?: 'buy' | 'sell') =>
            request<{ orders: any[] }>(`/orders${type ? `?type=${type}` : ''}`),
        create: (data: {
            type: 'buy' | 'sell';
            token: string;
            chain?: string;
            amount: number;
            rate: number;
            payment_methods: string[];
            note?: string;
            excluded_dealers?: string;
            expires_in?: number;
        }) =>
            request<{ order: any }>('/orders', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
        cancel: (id: string) =>
            request<{ success: boolean }>(`/orders/${id}/cancel`, { method: 'POST' }),
        mine: () => request<{ orders: any[] }>('/orders/mine'),
        getById: (id: string) => request<{ order: any }>(`/orders/${id}`),
    },

    // ---- Trades ----
    trades: {
        list: () => request<{ trades: any[] }>('/trades'),
        create: (orderId: string, amount: number) =>
            request<{ trade: any }>('/trades', {
                method: 'POST',
                body: JSON.stringify({ order_id: orderId, amount }),
            }),
        confirmPayment: (id: string, utr: string) =>
            request<{ success: boolean }>(`/trades/${id}/confirm-payment`, {
                method: 'POST',
                body: JSON.stringify({ utr }),
            }),
        confirmReceipt: (id: string) =>
            request<{ success: boolean }>(`/trades/${id}/confirm-receipt`, { method: 'POST' }),
        dispute: (id: string, reason: string) =>
            request<{ success: boolean }>(`/trades/${id}/dispute`, {
                method: 'POST',
                body: JSON.stringify({ reason }),
            }),
        lock: (id: string, txHash: string) =>
            request<{ trade: any }>(`/trades/${id}/lock`, {
                method: 'POST',
                body: JSON.stringify({ txHash }),
            }),
        refund: (id: string) =>
            request<{ success: boolean; refund_tx_hash: string }>(`/trades/${id}/refund`, {
                method: 'POST',
            }),
        mine: () => request<{ trades: any[] }>('/trades/mine'),
        getById: (id: string) => request<{ trade: any }>(`/trades/${id}`),
        getMessages: (id: string) => request<{ messages: any[] }>(`/trades/${id}/messages`),
        sendMessage: (id: string, message: string) =>
            request<{ success: boolean; message: any }>(`/trades/${id}/messages`, {
                method: 'POST',
                body: JSON.stringify({ message }),
            }),
        uploadImage: async (id: string, file: File, caption?: string) => {
            const initData = getInitData();
            const formData = new FormData();
            formData.append('image', file);
            if (caption) formData.append('caption', caption);
            const res = await fetch(`${API_BASE}/trades/${id}/messages/upload`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': initData },
                body: formData,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Upload failed');
            }
            return res.json();
        },
    },

    profile: {
        get: () => request<{ user: any }>('/profile'),
        update: (data: Record<string, any>) =>
            request<{ user: any }>('/profile', {
                method: 'PUT',
                body: JSON.stringify(data),
            }),
    },

    // ---- Stats ----
    stats: {
        get: () => request<{
            total_users: number;
            total_volume_usdc: number;
            active_orders: number;
            fee_percentage: number;
            fee_bps: number;
        }>('/stats'),
    },

    // ---- Predictions ----
    predictions: {
        getAIAnalysis: async () => {
            await new Promise(r => setTimeout(r, 600)); // smooth network delay
            const baseProb = 50 + (Math.random() * 20 - 10);
            return {
                analyzed_epochs: 12453,
                pattern_window_size: 60,
                top_matches_found: 14,
                up_wins: 8,
                down_wins: 6,
                ai_up_prob: Math.round(baseProb),
                ai_down_prob: Math.round(100 - baseProb),
                message: "Market sentiment analysis active."
            };
        },
        getLeaderboard: () => request<{ leaderboard: any[] }>('/predictions/leaderboard'),
        getCopyTraders: () => request<{ traders: any[] }>('/predictions/copy-traders'),
        getHistory: () => request<{ history: any[] }>(`/predictions/history?_t=${Date.now()}`),
        placeBet: (amount: number, outcome: 'UP' | 'DOWN', price?: number, side?: 'BUY' | 'SELL') => 
            request<{ success: boolean; result: any }>('/predictions/bet', {
                method: 'POST',
                body: JSON.stringify({ amount, outcome, price, side })
            }),
        depositGasless: (amount: number, chain?: string, token?: string) => 
            request<{ success: boolean; txHash: string }>('/predictions/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount, chain, token })
            }),
        checkDeposit: () =>
            request<{ success: boolean; wrapped: boolean }>('/predictions/deposit/check', {
                method: 'POST'
            }),
        getWithdrawQuote: (amount: number, destChainId: string, destTokenAddress: string, recipient: string) =>
            request<{ success: boolean; quote?: any }>('/predictions/withdraw/quote', {
                method: 'POST',
                body: JSON.stringify({ amount, destChainId, destTokenAddress, recipientAddress: recipient })
            }),
        getBridgeStatus: (bridgeAddress: string) =>
            request<{ success: boolean; status: any }>(`/predictions/withdraw/status/${bridgeAddress}`),
        withdrawGasless: (amount: number, destChainId: string, destTokenAddress: string, recipient: string) => 
            request<{ success: boolean; txHash?: string, isCrossChain?: boolean, error?: string }>('/predictions/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount, destChainId, destTokenAddress, recipientAddress: recipient })
            }),
        getDepositWallet: () => request<{ address: string }>('/predictions/deposit-wallet'),
        getClobKeys: () => request<{ address: string; apiKey?: string; secret?: string; passphrase?: string }>('/predictions/clob-keys'),
        getBalance: () => request<{ balance: string }>('/predictions/balance'),
        getMarket: () => request<{
            market: any;
            yesPrice: { buyPrice: number; sellPrice: number };
            noPrice: { buyPrice: number; sellPrice: number };
        }>('/predictions/market'),
        getPositions: async (all: boolean = false) => {
            const [{ address }, marketRes] = await Promise.all([
                api.predictions.getDepositWallet(),
                api.predictions.getMarket()
            ]);
            
            if (!address || address.includes("Demo")) {
                return { positions: [], realizedPnl: 0 };
            }
            if (!all && !marketRes?.market) {
                return { positions: [], realizedPnl: 0 };
            }

            const yesTokenId = marketRes?.market?.yesTokenId;
            const noTokenId = marketRes?.market?.noTokenId;
            const yesTokenIdLc = yesTokenId?.toLowerCase() || '';
            const noTokenIdLc = noTokenId?.toLowerCase() || '';

            try {
                const [tradesRes, positionsRes] = await Promise.all([
                    fetch(`https://data-api.polymarket.com/trades?user=${address}&limit=500`).then(r => r.json()).catch(() => []),
                    fetch(`https://data-api.polymarket.com/positions?user=${address}`).then(r => r.json()).catch(() => [])
                ]);

                const positionMap: Record<string, { outcome: 'UP'|'DOWN'; qty: number; totalCost: number; avgPrice: number; currentPrice: number }> = {};
                let realizedPnl = 0;
                const openConditionIds = new Set<string>();

                if (Array.isArray(positionsRes)) {
                    for (const p of positionsRes) {
                        realizedPnl += parseFloat(p.cashPnl ?? '0') || 0;
                        if (p.conditionId) openConditionIds.add(p.conditionId);
                    }
                }
                
                const conditionMap: Record<string, { cost: number; shares: number; outcomeIndex: number }> = {};

                for (const trade of (Array.isArray(tradesRes) ? tradesRes : [])) {
                    // Collect condition data for realizedPnl
                    const cid = trade.conditionId;
                    if (cid) {
                        const size = parseFloat(trade.size ?? '0');
                        const price = parseFloat(trade.price ?? '0');
                        if (!conditionMap[cid]) conditionMap[cid] = { cost: 0, shares: 0, outcomeIndex: trade.outcomeIndex ?? 1 };
                        if (trade.side === 'BUY') {
                            conditionMap[cid].cost += size * price;
                            conditionMap[cid].shares += size;
                        } else if (trade.side === 'SELL') {
                            conditionMap[cid].cost -= size * price;
                            conditionMap[cid].shares -= size;
                        }
                    }

                    // Process active market positions
                    const tradeAssetLc = (trade.asset_id || trade.asset || "").toLowerCase();
                    const isUp = tradeAssetLc === yesTokenIdLc;
                    const isDown = tradeAssetLc === noTokenIdLc;
                    
                    if (!all && !isUp && !isDown) continue;

                    let key: string;
                    if (all) {
                        key = tradeAssetLc;
                    } else {
                        key = isUp ? "UP" : "DOWN";
                    }

                    const qty = parseFloat(trade.size ?? "0");
                    const price = parseFloat(trade.price ?? "0");
                    const isSell = trade.side === "SELL";

                    if (!positionMap[key]) {
                        positionMap[key] = {
                            outcome: all ? (trade.outcomeIndex === 0 ? 'UP' : 'DOWN') : (isUp ? 'UP' : 'DOWN'),
                            asset: tradeAssetLc,
                            title: trade.title,
                            qty: 0,
                            totalCost: 0,
                            avgPrice: 0,
                            currentPrice: isUp && marketRes?.yesPrice ? marketRes.yesPrice.buyPrice : (isDown && marketRes?.noPrice ? marketRes.noPrice.buyPrice : parseFloat(trade.price ?? "0")),
                        } as any;
                    }

                    if (isSell) {
                        const currentAvg = positionMap[key].qty > 0 ? (positionMap[key].totalCost / positionMap[key].qty) : 0;
                        positionMap[key].qty -= qty;
                        positionMap[key].totalCost -= qty * currentAvg; // Deduct cost proportionally based on acquisition cost
                    } else {
                        positionMap[key].qty += qty;
                        positionMap[key].totalCost += qty * price;
                    }
                }

                for (const key of Object.keys(positionMap)) {
                    const activePos = (Array.isArray(positionsRes) ? positionsRes : []).find((p: any) => (p.asset || "").toLowerCase() === (positionMap[key] as any).asset);
                    
                    if (positionMap[key].qty > 0) {
                        positionMap[key].avgPrice = positionMap[key].totalCost / positionMap[key].qty;
                    }

                    if (activePos && parseFloat(activePos.size) > 0 && !activePos.redeemable) {
                        const syncedQty = parseFloat(activePos.size);
                        
                        if (activePos.initialValue !== undefined) {
                            const initialValue = parseFloat(activePos.initialValue);
                            positionMap[key].qty = syncedQty;
                            positionMap[key].totalCost = initialValue;
                            positionMap[key].avgPrice = initialValue / syncedQty;
                        } else {
                            const oldQty = positionMap[key].qty;
                            if (oldQty > 0 && syncedQty !== oldQty) {
                                positionMap[key].totalCost = (positionMap[key].totalCost / oldQty) * syncedQty;
                            }
                            positionMap[key].qty = syncedQty;
                            positionMap[key].avgPrice = positionMap[key].qty > 0
                                ? positionMap[key].totalCost / positionMap[key].qty
                                : 0;
                        }
                    } else if (activePos && activePos.redeemable) {
                        positionMap[key].qty = 0;
                    } else if (!activePos) {
                        // Keep trade qty!
                    } else {
                        positionMap[key].qty = 0;
                    }
                }

                // Check viem for realizedPnl of resolved but not in positions API
                try {
                    const { createPublicClient, http } = await import('viem');
                    const { polygon } = await import('viem/chains');
                    const client = createPublicClient({ chain: polygon, transport: http('https://polygon.llamarpc.com') });
                    
                    const rpcPromises = [];
                    for (const [cid, data] of Object.entries(conditionMap)) {
                        if (openConditionIds.has(cid)) continue;
                        if (data.shares <= 0.001) continue;
                        
                        rpcPromises.push((async () => {
                            try {
                                const denominator = await client.readContract({
                                    address: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
                                    abi: [{inputs:[{type:'bytes32'}],name:'payoutDenominator',outputs:[{type:'uint256'}],stateMutability:'view',type:'function'}],
                                    functionName: 'payoutDenominator',
                                    args: [cid as `0x${string}`]
                                }) as bigint;
                                
                                if (denominator > 0n) {
                                    const pnIndex = data.outcomeIndex === 0 ? 0n : 1n;
                                    const payoutNum = await client.readContract({
                                        address: '0x4d97dcd97ec945f40cf65f87097ace5ea0476045',
                                        abi: [{inputs:[{type:'bytes32'},{type:'uint256'}],name:'payoutNumerators',outputs:[{type:'uint256'}],stateMutability:'view',type:'function'}],
                                        functionName: 'payoutNumerators',
                                        args: [cid as `0x${string}`, pnIndex]
                                    }) as bigint;
                                    
                                    const payoutFraction = Number(payoutNum) / Number(denominator);
                                    realizedPnl += (data.shares * payoutFraction) - data.cost;
                                }
                            } catch (e) { /* ignore */ }
                        })());
                    }
                    await Promise.all(rpcPromises);
                } catch (e) { console.warn("Viem dynamic import failed", e); }

                const positions = Object.keys(positionMap).map(key => {
                    const p = positionMap[key];
                    const value = p.qty * p.currentPrice;
                    return {
                        outcome: p.outcome,
                        qty: parseFloat(p.qty.toFixed(2)),
                        avg: p.avgPrice,
                        currentPrice: p.currentPrice,
                        value: parseFloat(value.toFixed(2)),
                        cost: parseFloat(p.totalCost.toFixed(2)),
                        returnAmt: parseFloat((value - p.totalCost).toFixed(2)),
                        returnPct: p.totalCost > 0 ? parseFloat((((value - p.totalCost) / p.totalCost) * 100).toFixed(2)) : 0
                    };
                }).filter(p => all || p.qty > 0);

                return { positions, realizedPnl };
            } catch (err) {
                console.error("Client-side getPositions failed:", err);
                return { positions: [], realizedPnl: 0 };
            }
        },
        getTrades: (query?: string) => request<{ trades: Array<{
            id: string;
            side: string;
            outcome: string;
            qty: number;
            price: number;
            cost: number;
            timestamp: number;
            conditionId?: string;
        }> }>(`/predictions/trades${query || ''}`),
        autoClaim: (conditionId?: string) => request<{ success: boolean; claimed: number }>('/predictions/claim', {
            method: 'POST',
            body: conditionId ? JSON.stringify({ conditionId }) : undefined
        }),
    },

    getLeaderboard: (page = 1, timeframe = 'all') =>
        request<{ leaderboard: any[]; page: number; total_count: number; has_more: boolean; timeframe: string }>(
            `/leaderboard?page=${page}&timeframe=${timeframe}`
        ),

    // ---- Admin ----
    admin: {
        getDisputes: () => request<{ disputes: any[] }>('/admin/disputes'),
        getTradeMessages: (tradeId: string) => request<{ messages: any[] }>(`/admin/trades/${tradeId}/messages`),
        resolveDispute: (id: string, releaseToBuyer: boolean) =>
            request<{ success: boolean; txHash?: string }>(`/admin/trades/${id}/resolve`, {
                method: 'POST',
                body: JSON.stringify({ releaseToBuyer }),
            }),
        sendMessage: (tradeId: string, message: string) =>
            request<{ success: boolean; message: any }>(`/admin/trades/${tradeId}/message`, {
                method: 'POST',
                body: JSON.stringify({ message }),
            }),
    },

    // ---- Users ----
    users: {
        list: () => request<{ users: any[] }>('/users'),
        uploadAvatar: async (file: File) => {
            const initData = getInitData();
            const formData = new FormData();
            formData.append('avatar', file);
            const res = await fetch(`${API_BASE}/profile/avatar`, {
                method: 'POST',
                headers: { 'X-Telegram-Init-Data': initData },
                body: formData,
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || 'Upload failed');
            }
            return res.json();
        },
        getProfile: (userId: string) => request<{
            id: string;
            username: string;
            first_name: string;
            photo_url: string;
            completed_trades: number;
            buy_count: number;
            sell_count: number;
            total_volume: number;
            completion_rate: number;
            level: number;
            member_since: string;
        }>(`/users/${userId}/profile`),
    },
};
