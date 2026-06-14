import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll } from '@reown/appkit/networks';

const projectId = '6dcf53c47cdea609c48bc1adb474bfd0';

const metadata = {
    name: 'P2PFather',
    description: 'Telegram P2P Crypto Exchange',
    url: 'https://p2pfather.com',
    icons: ['https://p2pfather.com/favicon.ico'],
};

import { hotWalletConnector } from '../utils/hotWalletConnector';

import { http } from 'wagmi';

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll],
    connectors: [hotWalletConnector()],
    transports: {
        [mainnet.id]: http('https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [base.id]: http('https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [bsc.id]: http('https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [polygon.id]: http('https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [arbitrum.id]: http('https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [optimism.id]: http('https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [avalanche.id]: http('https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [linea.id]: http('https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
        [scroll.id]: http('https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'),
    }
});

// Bitget Wallet IDs (WalletConnect explorer)
const BITGET_WALLET_ID = '38f5d18bd8522c244bdd70cb4a68e0e718865155811c043f052fb9f1c51de662';
const BITGET_WALLET_LITE_ID = '21c3a371f72f0057186082edb2ddd43566f7e908508ac3e85373c6d1966ed614';

// Create the AppKit modal
export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks: [mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll],
    defaultNetwork: bsc,
    projectId,
    metadata,
    featuredWalletIds: [
        BITGET_WALLET_ID,
        BITGET_WALLET_LITE_ID,
    ],
    features: {
        analytics: false,
        email: true,
        socials: ['google', 'x', 'github', 'discord', 'apple'],
    },
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#4b5563',
        '--w3m-border-radius-master': '4px',
        '--w3m-color-mix': '#1f2937',
    },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
