import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic, getTelegramUser } from '../lib/telegram';
import { api } from '../lib/api';
import { IconHome, IconMarket, IconPlus, IconWallet, IconUser } from './Icons';
import './BottomNav.css';

const ADMIN_IDS = [123456789];

const baseTabs = [
    { path: '/', Icon: IconHome, label: 'Home' },
    { path: '/market', Icon: IconMarket, label: 'Market' },
    { path: '/create', Icon: IconPlus, label: 'New Ad' },
    { path: '/wallet', Icon: IconWallet, label: 'Wallet' },
    { path: '/profile', Icon: IconUser, label: 'Profile' },
];

// Simple shield icon for admin
function IconAdmin({ size = 22 }: { size?: number }) {
    return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>🛡️</span>;
}

export function BottomNav() {
    const [activeTrades, setActiveTrades] = useState(0);
    const tgUser = getTelegramUser();
    const isAdmin = tgUser && ADMIN_IDS.includes(tgUser.id);

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
                        {tab.path === '/' && activeTrades > 0 && (
                            <span className="nav-badge">{activeTrades}</span>
                        )}
                    </span>
                    <span className="nav-label">{tab.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}
