import re

# Read current env.ts
with open('src/config/env.ts', 'r') as f:
    content = f.read()

# We need to add the other RPC URLs
old_env_schema = """    BASE_RPC_URL: z.string().default("https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    BSC_RPC_URL: z.string().default("https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    USDC_ADDRESS: addressSchema.default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),"""

new_env_schema = """    BASE_RPC_URL: z.string().default("https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    BSC_RPC_URL: z.string().default("https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    POLYGON_RPC_URL: z.string().default("https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    MAINNET_RPC_URL: z.string().default("https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    ARBITRUM_RPC_URL: z.string().default("https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    OPTIMISM_RPC_URL: z.string().default("https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    AVALANCHE_RPC_URL: z.string().default("https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    LINEA_RPC_URL: z.string().default("https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    SCROLL_RPC_URL: z.string().default("https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER"),
    USDC_ADDRESS: addressSchema.default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),"""
    
content = content.replace(old_env_schema, new_env_schema)

with open('src/config/env.ts', 'w') as f:
    f.write(content)

# Update wallet.ts to use these environment variables
with open('src/services/wallet.ts', 'r') as f:
    wallet_content = f.read()

old_wallet_switch = """            let url = env.BASE_RPC_URL;
            const ALCHEMY_KEY = 'ALCHEMY_API_KEY_PLACEHOLDER';
            switch (chain) {
                case 'base': url = env.BASE_RPC_URL; break; // usually https://base-mainnet.g.alchemy.com/v2/...
                case 'bsc': url = env.BSC_RPC_URL; break;
                case 'polygon': url = `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'mainnet': url = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'arbitrum': url = `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'optimism': url = `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'avalanche': url = `https://avax-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'linea': url = `https://linea-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
                case 'scroll': url = `https://scroll-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`; break;
            }"""
            
new_wallet_switch = """            let url = env.BASE_RPC_URL;
            switch (chain) {
                case 'base': url = env.BASE_RPC_URL; break;
                case 'bsc': url = env.BSC_RPC_URL; break;
                case 'polygon': url = env.POLYGON_RPC_URL; break;
                case 'mainnet': url = env.MAINNET_RPC_URL; break;
                case 'arbitrum': url = env.ARBITRUM_RPC_URL; break;
                case 'optimism': url = env.OPTIMISM_RPC_URL; break;
                case 'avalanche': url = env.AVALANCHE_RPC_URL; break;
                case 'linea': url = env.LINEA_RPC_URL; break;
                case 'scroll': url = env.SCROLL_RPC_URL; break;
            }"""

wallet_content = wallet_content.replace(old_wallet_switch, new_wallet_switch)

with open('src/services/wallet.ts', 'w') as f:
    f.write(wallet_content)

# Update .env
with open('.env', 'a') as f:
    f.write("\nPOLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("OPTIMISM_RPC_URL=https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("AVALANCHE_RPC_URL=https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("LINEA_RPC_URL=https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")
    f.write("SCROLL_RPC_URL=https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER\n")

