import React, { useState, useEffect } from 'react';
import './MaintenanceNotice.css';

interface MaintenanceNoticeProps {
  user?: any;
  onRefresh?: () => void;
}

export const MaintenanceNotice: React.FC<MaintenanceNoticeProps> = ({ user, onRefresh }) => {
  const [bypassed, setBypassed] = useState(() => {
    return localStorage.getItem('p2p_bypass_maintenance') === 'true';
  });
  const [status, setStatus] = useState<{
    maintenance: boolean;
    title: string;
    message: string;
    estimatedTime: string;
  }>({
    maintenance: false,
    title: 'System Upgrade in Progress',
    message: 'P2PFather is currently undergoing a production system upgrade to enhance escrow security and performance.',
    estimatedTime: 'Expected back online shortly'
  });

  useEffect(() => {
    // Fetch maintenance status from backend if available
    fetch('/api/miniapp/system/status')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.maintenance === 'boolean') {
          setStatus(data);
        }
      })
      .catch(() => {
        // Fallback to default maintenance state if API is down during deploy
      });
  }, []);

  // Allow admin to bypass notice to test app
  const isAdmin = user?.is_admin || user?.isAdmin;

  if (!status.maintenance || bypassed) {
    return null;
  }

  return (
    <div className="maintenance-overlay">
      <div className="maintenance-card">
        
        {/* Animated Icon & Badge */}
        <div className="maintenance-header">
          <div className="maintenance-icon-wrapper">
            <span className="maintenance-gear">🛠️</span>
          </div>
          <div className="maintenance-badge">
            <span className="badge-dot"></span>
            SYSTEM MAINTENANCE ACTIVE
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="maintenance-title">{status.title}</h2>
        <p className="maintenance-message">{status.message}</p>

        {/* Time & Status Info */}
        <div className="maintenance-info-box">
          <div className="info-item">
            <span className="info-label">STATUS</span>
            <span className="info-value warning-text">Production Maintenance</span>
          </div>
          <div className="info-item">
            <span className="info-label">ESTIMATED DOWNTIME</span>
            <span className="info-value">{status.estimatedTime}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="maintenance-actions">
          <button 
            onClick={() => {
              if (onRefresh) onRefresh();
              window.location.reload();
            }} 
            className="maintenance-btn primary-btn"
          >
            🔄 Check Status & Refresh
          </button>
          
          <a 
            href="https://t.me/P2pFather0" 
            target="_blank" 
            rel="noopener noreferrer"
            className="maintenance-btn secondary-btn"
          >
            💬 Telegram Community Group
          </a>
        </div>

        {/* Admin Bypass Option */}
        {isAdmin && (
          <div className="admin-bypass-container">
            <button 
              onClick={() => {
                localStorage.setItem('p2p_bypass_maintenance', 'true');
                setBypassed(true);
              }}
              className="admin-bypass-btn"
            >
              🔓 Admin Access (Bypass Maintenance)
            </button>
          </div>
        )}

        <div className="maintenance-footer font-mono">
          P2PFather Protocol • Base & BSC Mainnet
        </div>

      </div>
    </div>
  );
};
