// Telegram WebApp SDK integration
// https://core.telegram.org/bots/webapps

declare global {
    interface Window {
        Telegram?: {
            WebApp: TelegramWebApp;
        };
    }
}

export interface TelegramWebApp {
    initData: string;
    initDataUnsafe: {
        query_id?: string;
        user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
        };
        start_param?: string;
        auth_date: number;
        hash: string;
    };
    version: string;
    platform: string;
    colorScheme: 'light' | 'dark';
    themeParams: Record<string, string>;
    isExpanded: boolean;
    viewportHeight: number;
    viewportStableHeight: number;
    headerColor: string;
    backgroundColor: string;
    ready: () => void;
    expand: () => void;
    close: () => void;
    openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
    openTelegramLink: (url: string) => void;
    setHeaderColor: (color: string) => void;
    setBackgroundColor: (color: string) => void;
    enableClosingConfirmation: () => void;
    disableClosingConfirmation: () => void;
    onEvent: (eventType: string, callback: () => void) => void;
    offEvent: (eventType: string, callback: () => void) => void;
    MainButton: {
        text: string;
        color: string;
        textColor: string;
        isVisible: boolean;
        isActive: boolean;
        isProgressVisible: boolean;
        setText: (text: string) => void;
        onClick: (callback: () => void) => void;
        offClick: (callback: () => void) => void;
        show: () => void;
        hide: () => void;
        enable: () => void;
        disable: () => void;
        showProgress: (leaveActive?: boolean) => void;
        hideProgress: () => void;
    };
    BackButton: {
        isVisible: boolean;
        onClick: (callback: () => void) => void;
        offClick: (callback: () => void) => void;
        show: () => void;
        hide: () => void;
    };
    HapticFeedback: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };
}

export function getTelegramWebApp(): TelegramWebApp | null {
    return window.Telegram?.WebApp ?? null;
}

/**
 * Persist initData to sessionStorage the first time Telegram provides it.
 * This protects against Android memory-killing the WebView when the user switches
 * to a UPI payment app and returns — the page reloads but Telegram no longer
 * re-injects initData, so we serve it from sessionStorage instead.
 */
export function persistInitData(): void {
    const tgInit = getTelegramWebApp()?.initData;
    if (!tgInit) return;
    try {
        // Only persist if not already saved (avoids redundant writes)
        if (!sessionStorage.getItem('wa_tg_init_data')) {
            sessionStorage.setItem('wa_tg_init_data', tgInit);
        }
    } catch {
        // sessionStorage unavailable — silently ignore
    }
}

export function getInitData(): string {
    const tgInit = getTelegramWebApp()?.initData;
    if (tgInit) return tgInit;
    try {
        // sessionStorage: survives Android app-switch reloads within same tab
        // localStorage: survives trade room magic-link auth (WhatsApp/web users)
        return sessionStorage.getItem('wa_tg_init_data') || localStorage.getItem('trade_init_data') || sessionStorage.getItem('trade_init_data') || '';
    } catch {
        return '';
    }
}

export function getTelegramUser() {
    return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

export function isTelegramEnvironment(): boolean {
    if (getTelegramWebApp()?.initData) return true;
    // Also true if we have a persisted session from a previous launch in this tab
    try {
        return !!(sessionStorage.getItem('wa_tg_init_data') || sessionStorage.getItem('trade_init_data'));
    } catch {
        return false;
    }
}

export function setupTelegramApp() {
    const webapp = getTelegramWebApp();
    if (!webapp) return;

    webapp.ready();
    webapp.expand();
    webapp.setHeaderColor('#050505');
    webapp.setBackgroundColor('#050505');
    webapp.enableClosingConfirmation();
}

export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'selection') {
    const webapp = getTelegramWebApp();
    if (!webapp) return;

    if (type === 'selection') {
        webapp.HapticFeedback.selectionChanged();
    } else if (['success', 'error', 'warning'].includes(type)) {
        webapp.HapticFeedback.notificationOccurred(type as 'success' | 'error' | 'warning');
    } else {
        webapp.HapticFeedback.impactOccurred(type as 'light' | 'medium' | 'heavy');
    }
}
