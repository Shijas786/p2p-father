import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { IconHome, IconMarket, IconPlus, IconWallet, IconUser } from './Icons';
import './BottomNav.css';

const tabs = [
    { path: '/', Icon: IconHome, label: 'Home' },
    { path: '/market', Icon: IconMarket, label: 'Market' },
    { path: '/create', Icon: IconPlus, label: 'New Ad' },
    { path: '/wallet', Icon: IconWallet, label: 'Wallet' },
    { path: '/profile', Icon: IconUser, label: 'Profile' },
];

export function BottomNav() {
    const [activeTrades, setActiveTrades] = useState(0);

    useEffect(() => {
        // Poll for active trades count every 30s
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
