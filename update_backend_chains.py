import re

with open('src/services/wallet.ts', 'r') as f:
    content = f.read()

# Replace Chain type
old_type = "type Chain = 'base' | 'bsc' | 'polygon';"
new_type = "type Chain = 'base' | 'bsc' | 'polygon' | 'mainnet' | 'arbitrum' | 'optimism' | 'avalanche' | 'linea' | 'scroll';"
content = content.replace(old_type, new_type)

# Replace providers initialization
old_providers = """    private providers: Record<string, ethers.JsonRpcProvider | null> = {
        base: null,
        bsc: null,
        polygon: null
    };"""
new_providers = """    private providers: Record<string, ethers.JsonRpcProvider | null> = {
        base: null, bsc: null, polygon: null, mainnet: null, 
        arbitrum: null, optimism: null, avalanche: null, linea: null, scroll: null
    };"""
content = content.replace(old_providers, new_providers)

# Replace getProvider logic
old_get_provider = """    private getProvider(chain: Chain = 'base'): ethers.JsonRpcProvider {
        if (!this.providers[chain]) {
            const url = chain === 'base' ? env.BASE_RPC_URL : chain === 'bsc' ? env.BSC_RPC_URL : (process.env.POLYGON_RPC_URL || "https://polygon-rpc.com");
            this.providers[chain] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[chain]!;
    }"""
    
new_get_provider = """    private getProvider(chain: Chain = 'base'): ethers.JsonRpcProvider {
        if (!this.providers[chain]) {
            let url = env.BASE_RPC_URL;
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
            }
            this.providers[chain] = new ethers.JsonRpcProvider(url);
        }
        return this.providers[chain]!;
    }"""
content = content.replace(old_get_provider, new_get_provider)

with open('src/services/wallet.ts', 'w') as f:
    f.write(content)


# Now update miniapp.ts
with open('src/api/miniapp.ts', 'r') as f:
    api_content = f.read()

old_chain_mapping = """        let chain: 'base' | 'bsc' | 'polygon' = 'base';
        if (chainId === 56) chain = 'bsc';
        else if (chainId === 137) chain = 'polygon';"""

new_chain_mapping = """        let chain: any = 'base';
        if (chainId === 1) chain = 'mainnet';
        else if (chainId === 56) chain = 'bsc';
        else if (chainId === 137) chain = 'polygon';
        else if (chainId === 42161) chain = 'arbitrum';
        else if (chainId === 10) chain = 'optimism';
        else if (chainId === 43114) chain = 'avalanche';
        else if (chainId === 59144) chain = 'linea';
        else if (chainId === 534352) chain = 'scroll';
        else if (chainId === 8453) chain = 'base';"""

api_content = api_content.replace(old_chain_mapping, new_chain_mapping)

with open('src/api/miniapp.ts', 'w') as f:
    f.write(api_content)
