import { Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { BottomNav } from './BottomNav';
import './Layout.css';

export function Layout() {
    const { user } = useAuth();

    return (
        <div className="app-layout">
            <div className="app-content">
                <Outlet />
            </div>
            <BottomNav user={user} />
        </div>
    );
}
