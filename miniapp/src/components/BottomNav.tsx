import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { haptic } from '../lib/telegram';
import { api } from '../lib/api';
import { IconProfile } from './Icons';
import './BottomNav.css';



const baseTabs = [
    { path: '/', icon: '/icons for trade/nav/p2p.svg?v=16', label: 'P2P' },
    { path: '/orders', icon: '/icons for trade/nav/orders.svg?v=5', label: 'Orders' },
    { path: '/ads', icon: '/icons for trade/nav/ads.svg?v=4', label: 'Ads' },
    { path: '/wallet', icon: '/icons for trade/nav/wallet.svg?v=4', label: 'Wallet' },
    { path: '/profile', icon: '', Icon: IconProfile, label: 'Profile' },
];

function IconAdmin({ size = 28 }: { size?: number }) {
    return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>🛡️</span>;
}

interface Props {
    user: any;
}

export function BottomNav({ user }: Props) {
    const [activeTrades, setActiveTrades] = useState(0);
    const isAdmin = user?.is_admin;

    const tabs: any[] = isAdmin
        ? [...baseTabs, { path: '/admin', icon: '', Icon: IconAdmin, label: 'Admin' }]
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
                        {tab.icon ? (
                            <img src={tab.icon} alt="" className="nav-icon-img" />
                        ) : tab.Icon ? (
                            <tab.Icon size={28} />
                        ) : null}
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
