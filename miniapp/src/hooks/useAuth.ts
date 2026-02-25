import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { getTelegramUser, isTelegramEnvironment } from '../lib/telegram';

export interface AppUser {
    id: string;
    telegram_id: number;
    username: string | null;
    first_name: string | null;
    wallet_address: string | null;
    wallet_type: 'bot' | 'external';
    upi_id: string | null;
    trade_count: number;
    completed_trades: number;
    trust_score: number;
    tier: string;
    is_verified: boolean;
    is_admin: boolean;
}

export function useAuth() {
    const [user, setUser] = useState<AppUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const login = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            if (isTelegramEnvironment()) {
                const { user: authUser } = await api.auth.login();
                setUser(authUser);
            } else {
                // Dev mode: create mock user
                const tgUser = getTelegramUser();
                setUser({
                    id: 'dev-user',
                    telegram_id: tgUser?.id ?? 12345,
                    username: tgUser?.username ?? 'dev_user',
                    first_name: tgUser?.first_name ?? 'Developer',
                    wallet_address: null,
                    wallet_type: 'bot',
                    upi_id: null,
                    trade_count: 0,
                    completed_trades: 0,
                    trust_score: 100,
                    tier: 'standard',
                    is_verified: false,
                    is_admin: false,
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
