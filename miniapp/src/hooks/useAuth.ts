import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { getTelegramUser, isTelegramEnvironment } from '../lib/telegram';
import { DEV_USER } from '../lib/devMocks';

export interface AppUser {
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    photo_url?: string | null;
    wallet_address: string | null;
    wallet_type: 'bot' | 'external';
    upi_id: string | null;
    phone_number?: string | null;
    bank_account_number?: string | null;
    bank_ifsc?: string | null;
    bank_name?: string | null;
    digital_rupee_id?: string | null;
    bio?: string | null;
    instagram_handle?: string | null;
    x_handle?: string | null;
    receive_address?: string | null;
    cdm_bank_number?: string | null;
    cdm_bank_name?: string | null;
    cdm_phone?: string | null;
    cdm_user_name?: string | null;
    trade_count: number;
    completed_trades: number;
    trust_score: number;
    points?: number;
    tier: string;
    is_verified: boolean;
    is_admin: boolean;
    created_at?: string;
}

export function useAuth() {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const login = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Check if URL has ?token=... for Web Trade Room magic link auth
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (token) {
                try {
                    const res = await api.authWithTradeToken(token);
                    if (res.success && res.initData && res.user) {
                        localStorage.setItem('trade_init_data', res.initData);
                        setUser(res.user);
                        setLoading(false);
                        return;
                    }
                } catch (tokenErr: any) {
                    console.error('[WebTradeAuth] Token auth failed:', tokenErr?.message);
                }
            }

            if (isTelegramEnvironment() || localStorage.getItem('trade_init_data')) {
                const { user: authUser } = await api.auth.login();
                setUser(authUser);
            } else {
                // Dev mode: use rich mock user so all UI stats are visible
                const tgUser = getTelegramUser();
                setUser({
                    ...DEV_USER,
                    // Allow overriding with real Telegram user info if somehow available
                    telegram_id: tgUser?.id ?? DEV_USER.telegram_id,
                    username: tgUser?.username ?? DEV_USER.username,
                    first_name: tgUser?.first_name ?? DEV_USER.first_name,
                });
            }
        } catch (err: any) {
            // Add debug info for troubleshooting
            const webapp = window.Telegram?.WebApp;
            const debugInfo = [
                err.message,
                `Platform: ${webapp?.platform || 'unknown'}`,
                `Version: ${webapp?.version || 'N/A'}`,
                `InitData: ${webapp?.initData ? 'present' : 'missing'}`,
            ].join('\n');
            setError(debugInfo);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        login();
    }, [login]);

    const refreshUser = useCallback(async () => {
        try {
            const { user: freshUser } = await api.profile.get();
            setUser(freshUser);
        } catch { }
    }, []);

    return { user, loading, error, login, refreshUser, setUser };
}
