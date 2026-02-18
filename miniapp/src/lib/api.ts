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
            address: string;
            vault_base_usdc?: string;
            vault_bsc_usdc?: string;
            vault_base_usdt?: string;
            vault_bsc_usdt?: string;
            vault_base_reserved?: string;
            vault_bsc_reserved?: string;

            reserved_base_usdc?: string;
            reserved_base_usdt?: string;
            reserved_bsc_usdc?: string;
            reserved_bsc_usdt?: string;

            wallet_type?: string;
        }>('/wallet/balances'),
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
        withdrawFromVault: (amount: number, token: string, chain: string) =>
            request<{ txHash: string }>('/wallet/vault/withdraw', {
                method: 'POST',
                body: JSON.stringify({ amount, token, chain }),
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

    // ---- Profile ----
    profile: {
        get: () => request<{ user: any }>('/profile'),
        update: (data: { upi_id?: string }) =>
            request<{ user: any }>('/profile', {
                method: 'PUT',
                body: JSON.stringify(data),
            }),
    },

    // ---- Bridge ----
    bridge: {
        getQuote: (data: {
            fromChainId: number;
            toChainId: number;
            fromToken: string;
            toToken: string;
            amount: string;
        }) =>
            request<any>('/bridge/quote', {
                method: 'POST',
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

    getLeaderboard: () => request<{ leaderboard: any[] }>('/leaderboard'),

    // ---- Admin ----
    admin: {
        getDisputes: () => request<{ disputes: any[] }>('/admin/disputes'),
        resolveDispute: (id: string, releaseToBuyer: boolean) =>
            request<{ success: boolean; txHash?: string }>(`/admin/trades/${id}/resolve`, {
                method: 'POST',
                body: JSON.stringify({ releaseToBuyer }),
            }),
    },

    // ---- Users ----
    users: {
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
    },
};
