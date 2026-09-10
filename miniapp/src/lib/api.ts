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
            cache: 'no-store',
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
        executeRawTransaction: (data: { to: string; data: string; value: string; chainId: number }) =>
            request<{ txHash: string }>('/wallet/execute', {
                method: 'POST',
                body: JSON.stringify(data),
            }),
        connectExternal: (address: string) =>
            request<{ success: boolean }>('/wallet/connect', {
                method: 'POST',
                body: JSON.stringify({ address }),
            }),
        connectBot: () => request<{ success: boolean; address: string }>('/wallet/bot', { method: 'POST' }),
        switchBot: (target: 'telegram' | 'whatsapp') =>
            request<{ success: boolean; target: string; address: string; wallet_index: number }>('/wallet/switch-bot', {
                method: 'POST',
                body: JSON.stringify({ target }),
            }),
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
            allowed_dealers?: string;
            expires_in?: number;
            new_traders_only?: boolean;
            require_kyc?: boolean;
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
        getStats: () => request<{
            total_users: number; total_trades: number; completed_trades: number;
            active_orders: number; active_trades: number; active_disputes: number;
            total_volume: number; total_fees: number; volume_today: number;
        }>('/admin/stats'),
        getTrades: (status = 'all', page = 1) =>
            request<{ trades: any[]; total: number; page: number; pageSize: number }>(
                `/admin/trades?status=${status}&page=${page}`
            ),
        toggleBanUser: (userId: string) =>
            request<{ success: boolean; is_banned: boolean; message: string }>(`/admin/users/${userId}/toggle-ban`, {
                method: 'POST'
            }),
        getIpClusters: () => request<{ success: boolean; clusters: any[] }>('/admin/ip-clusters'),
        kickAllOnIp: (ip: string) =>
            request<{ success: boolean; bannedCount: number }>('/admin/kick-ip-all', {
                method: 'POST',
                body: JSON.stringify({ ip })
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

    // ---- KYC (Didit) ----
    kyc: {
        start: () => request<{ success: boolean; url: string; session_id: string; status: string }>('/kyc/start', {
            method: 'POST',
        }),
        getStatus: () => request<{
            kyc_status: 'unverified' | 'pending' | 'approved' | 'rejected';
            is_verified: boolean;
            kyc_verified_at: string | null;
            country: string | null;
            document_type: string | null;
        }>('/kyc/status'),
    },

    // ---- WhatsApp ----
    whatsapp: {
        getLinkCode: () => request<{
            code: string;
            expires_in_seconds: number;
            wa_bot_number: string;
            wa_link: string;
        }>('/whatsapp/link-code', { method: 'POST' }),
        updatePreference: (channel: 'telegram' | 'whatsapp' | 'both') => request<{
            success: boolean;
            preferred_channel: string;
        }>('/whatsapp/preference', { method: 'PUT', body: JSON.stringify({ channel }) }),
        unlink: () => request<{ success: boolean; user: any }>('/whatsapp/unlink', { method: 'POST' }),
    },

    // ---- Web Trade Room Magic Token Auth ----
    authWithTradeToken: (token: string) => request<{
        success: boolean;
        initData: string;
        tradeId: string;
        user: any;
    }>('/auth/trade-token', {
        method: 'POST',
        body: JSON.stringify({ token }),
    }),
};


