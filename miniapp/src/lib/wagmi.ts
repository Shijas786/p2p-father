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

import { http, fallback } from 'wagmi';
import { Attribution } from 'ox/erc8021';

export const BASE_BUILDER_CODE = 'bc_yuknhe8k';
export const BASE_BUILDER_DATA_SUFFIX = Attribution.toDataSuffix({
    codes: [BASE_BUILDER_CODE],
});

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks: [mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll],
    connectors: [hotWalletConnector()],
    dataSuffix: BASE_BUILDER_DATA_SUFFIX,
    transports: (() => {
        const alchKey = import.meta.env.VITE_ALCHEMY_KEY || '';
        const alch = (net: string) => alchKey ? [http(`https://${net}.g.alchemy.com/v2/${alchKey}`)] : [];
        return {
            [mainnet.id]: fallback([
                ...alch('eth-mainnet'),
                http('https://ethereum-rpc.publicnode.com'),
                http('https://eth.llamarpc.com'),
            ]),
            [base.id]: fallback([
                ...alch('base-mainnet'),
                http('https://mainnet.base.org'),
                http('https://base-rpc.publicnode.com'),
            ]),
            [bsc.id]: fallback([
                ...alch('bnb-mainnet'),
                http('https://bsc-dataseed.binance.org'),
                http('https://bsc.publicnode.com'),
                http('https://bsc-dataseed1.defibit.io'),
            ]),
            [polygon.id]: fallback([
                ...alch('polygon-mainnet'),
                http('https://polygon.publicnode.com'),
                http('https://polygon-bor-rpc.publicnode.com'),
            ]),
            [arbitrum.id]: fallback([
                ...alch('arb-mainnet'),
                http('https://arb1.arbitrum.io/rpc'),
                http('https://arbitrum.publicnode.com'),
            ]),
            [optimism.id]: fallback([
                ...alch('opt-mainnet'),
                http('https://mainnet.optimism.io'),
                http('https://optimism.publicnode.com'),
            ]),
            [avalanche.id]: fallback([
                ...alch('avax-mainnet'),
                http('https://api.avax.network/ext/bc/C/rpc'),
                http('https://avalanche.publicnode.com'),
            ]),
            [linea.id]: fallback([
                ...alch('linea-mainnet'),
                http('https://rpc.linea.build'),
            ]),
            [scroll.id]: fallback([
                ...alch('scroll-mainnet'),
                http('https://rpc.scroll.io'),
            ]),
        };
    })(),
});

// Featured Wallet IDs (WalletConnect explorer)
const METAMASK_WALLET_ID = 'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96';
const TRUST_WALLET_ID = '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0';

// Create the AppKit modal
export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks: [mainnet, base, bsc, polygon, arbitrum, optimism, avalanche, linea, scroll],
    defaultNetwork: bsc,
    projectId,
    metadata,
    featuredWalletIds: [
        METAMASK_WALLET_ID,
        TRUST_WALLET_ID,
    ],
    features: {
        analytics: false,
        email: false,
        socials: false,
    },
    themeMode: 'dark',
    themeVariables: {
        '--w3m-accent': '#4b5563',
        '--w3m-border-radius-master': '4px',
        '--w3m-color-mix': '#1f2937',
    },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
