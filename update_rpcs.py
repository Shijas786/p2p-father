import re

# Update wagmi.ts
with open('miniapp/src/lib/wagmi.ts', 'r') as f:
    wagmi_content = f.read()

wagmi_replacements = {
    "http('https://eth.llamarpc.com')": "http('https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://mainnet.base.org')": "http('https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://bsc-dataseed.binance.org')": "http('https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://polygon-rpc.com')": "http('https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://arb1.arbitrum.io/rpc')": "http('https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://mainnet.optimism.io')": "http('https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://api.avax.network/ext/bc/C/rpc')": "http('https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://rpc.linea.build')": "http('https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')",
    "http('https://rpc.scroll.io')": "http('https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER')"
}

for old, new in wagmi_replacements.items():
    wagmi_content = wagmi_content.replace(old, new)

with open('miniapp/src/lib/wagmi.ts', 'w') as f:
    f.write(wagmi_content)

# Update hotWalletConnector.ts
with open('miniapp/src/utils/hotWalletConnector.ts', 'r') as f:
    hot_content = f.read()

hot_replacements = {
    "'https://eth.llamarpc.com'": "'https://eth-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://mainnet.base.org'": "'https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://bsc-dataseed.binance.org'": "'https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://polygon-rpc.com'": "'https://polygon-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://arb1.arbitrum.io/rpc'": "'https://arb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://mainnet.optimism.io'": "'https://opt-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://api.avax.network/ext/bc/C/rpc'": "'https://avax-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://rpc.linea.build'": "'https://linea-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'",
    "'https://rpc.scroll.io'": "'https://scroll-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER'"
}

for old, new in hot_replacements.items():
    hot_content = hot_content.replace(old, new)

with open('miniapp/src/utils/hotWalletConnector.ts', 'w') as f:
    f.write(hot_content)

# Update .env
with open('.env', 'r') as f:
    env_content = f.read()

env_content = re.sub(r'BASE_RPC_URL=.*', 'BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER', env_content)
env_content = re.sub(r'BSC_RPC_URL=.*', 'BSC_RPC_URL=https://bnb-mainnet.g.alchemy.com/v2/ALCHEMY_API_KEY_PLACEHOLDER', env_content)

with open('.env', 'w') as f:
    f.write(env_content)
