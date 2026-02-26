import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { base, bsc } from '@reown/appkit/networks';

const projectId = '6dcf53c47cdea609c48bc1adb474bfd0';

const metadata = {
    name: 'P2PFather',
    description: 'Telegram P2P Crypto Exchange',
    url: 'https://p2pfather.com',
    icons: ['https://p2pfather.com/favicon.ico'],
};

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [base, bsc],
});

// Create the AppKit modal
export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks: [base, bsc],
    defaultNetwork: bsc,
    projectId,
    metadata,
    features: {
        analytics: false,
        email: false,
        socials: false,
    },
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#84cc16',
        '--w3m-border-radius-master': '2px',
    },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
