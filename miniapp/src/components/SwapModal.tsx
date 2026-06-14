import React from 'react';
import { IconX } from './Icons';
import { LiFiWidget, WidgetConfig } from '@lifi/widget';

interface SwapModalProps {
    onClose: () => void;
}

export function SwapModal({ onClose }: SwapModalProps) {
    const widgetConfig: WidgetConfig = {
        apiKey: '2c32a108-e9b8-4563-a59a-b58a2a3264da.ecf7206c-86cd-438c-bea0-4f66a553c504',
        integrator: 'p2pfather',
        feeConfig: {
            fee: 0.005, // 0.5%
            name: "P2PFather",
        },
        appearance: 'dark',
        variant: 'compact',
    };

    return (
        <div className="deposit-modal-overlay animate-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="deposit-modal-container slide-up" onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden' }}>
                <div className="deposit-modal-header" style={{ padding: '20px 20px 10px 20px', borderBottom: 'none' }}>
                    <div className="deposit-modal-title">Swap & Bridge</div>
                    <button className="icon-btn-rounded" onClick={onClose}>
                        <IconX size={20} />
                    </button>
                </div>
                <div style={{ height: '550px', width: '100%', overflowY: 'auto' }}>
                    <LiFiWidget integrator="p2pfather" config={widgetConfig} />
                </div>
            </div>
        </div>
    );
}
