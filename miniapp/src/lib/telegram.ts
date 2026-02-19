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

export function getInitData(): string {
    return getTelegramWebApp()?.initData ?? '';
}

export function getTelegramUser() {
    return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

export function isTelegramEnvironment(): boolean {
    return !!getTelegramWebApp()?.initData;
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
