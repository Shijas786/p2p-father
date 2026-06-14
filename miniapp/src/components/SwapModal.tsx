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
        theme: {
            colorSchemes: {
                dark: {
                    palette: {
                        primary: {
                            main: '#28588A', // Blue button
                        },
                        background: {
                            default: '#121212',
                            paper: '#1A1A1A',
                        },
                    }
                }
            },
            shape: {
                borderRadius: 12,
            },
            container: {
                border: '1px solid #282828',
                borderRadius: '16px',
                boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.4)',
            }
        }
    };

    return (
        <div className="deposit-modal-overlay animate-in" onClick={onClose} style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
            <div className="deposit-modal-container" onClick={e => e.stopPropagation()} style={{ 
                padding: 0, 
                overflow: 'hidden',
                position: 'relative',
                bottom: 'auto',
                width: '100%',
                maxWidth: '440px',
                borderRadius: '16px',
                height: 'auto',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column'
            }}>
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
