import React from 'react';
import { IconX } from './Icons';
import { LiFiWidget, WidgetConfig } from '@lifi/widget';
import { useAccount } from 'wagmi';

interface SwapModalProps {
    onClose: () => void;
}

export function SwapModal({ onClose }: SwapModalProps) {
    const { chainId, address, isConnected, connector } = useAccount();
    console.log('[SwapModal] Wagmi state:', { address, isConnected, connector: connector?.id });

    const widgetConfig: WidgetConfig = {
        apiKey: '2c32a108-e9b8-4563-a59a-b58a2a3264da.ecf7206c-86cd-438c-bea0-4f66a553c504',
        integrator: 'p2pfather',
        feeConfig: {
            fee: 0.005, // 0.5%
            name: "P2PFather",
        },
        appearance: 'dark',
        variant: 'compact',
        hiddenUI: {
            poweredBy: true,
            walletMenu: true,
        },
        ...(chainId && { fromChain: chainId }),
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
        <div className="page wallet-page animate-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, overflowY: 'auto', background: '#111318' }}>
            <div className="send-header" onClick={onClose} style={{ display: 'flex', alignItems: 'center', padding: '16px', cursor: 'pointer', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                <span style={{ marginLeft: 8, fontSize: '16px', fontWeight: 'bold' }}>Swap</span>
            </div>
            
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ width: '100%', maxWidth: '380px' }}>
                    <LiFiWidget 
                        integrator="p2pfather" 
                        config={widgetConfig} 
                    />
                </div>
            </div>
        </div>
    );
}
