import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import './BottomNav.css';



// Binance-style SVG icons
function IconP2P({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function IconOrders({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="18" rx="2" />
            <path d="M8 7h8" />
            <path d="M8 11h8" />
            <path d="M8 15h4" />
        </svg>
    );
}

function IconAds({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
        </svg>
    );
}

function IconWallet({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" />
            <path d="M1 10h22" />
        </svg>
    );
}

function IconProfile({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function IconAdmin({ size = 22 }: { size?: number }) {
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>🛡️</span>;
}

const baseTabs = [
    { path: '/', Icon: IconP2P, label: 'P2P' },
    { path: '/orders', Icon: IconOrders, label: 'Orders' },
    { path: '/ads', Icon: IconAds, label: 'Ads' },
    { path: '/wallet', Icon: IconWallet, label: 'Wallet' },
    { path: '/profile', Icon: IconProfile, label: 'Profile' },
];

interface Props {
    user: any;
}

export function BottomNav({ user }: Props) {
    const [activeTrades, setActiveTrades] = useState(0);
    const isAdmin = user?.is_admin;

    const tabs = isAdmin
        ? [...baseTabs, { path: '/admin', Icon: IconAdmin, label: 'Admin' }]
        : baseTabs;

    useEffect(() => {
        async function check() {
            try {
                const data = await api.trades.list();
                const active = (data.trades || []).filter(
                    (t: any) => !['completed', 'cancelled', 'expired', 'refunded'].includes(t.status)
                );
                setActiveTrades(active.length);
            } catch { }
        }
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <nav className="bottom-nav">
            {tabs.map((tab) => (
                <NavLink
                    key={tab.path}
                    to={tab.path}
                    className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
                    onClick={() => haptic('selection')}
                    end={tab.path === '/'}
                >
                    <span className="nav-icon">
                        <tab.Icon size={22} />
                        {tab.path === '/orders' && activeTrades > 0 && (
                            <span className="nav-badge">{activeTrades}</span>
                        )}
                    </span>
                    <span className="nav-label">{tab.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
