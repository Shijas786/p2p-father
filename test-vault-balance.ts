import { escrowService } from './src/services/escrow';

async function main() {
    const walletAddress = "0x1B0C5760a300358FA52a2bD58e4859EB9fb9ab79"; // aslamdt
    const USDT_BASE = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
    
    const balBase = await escrowService.getVaultBalance(walletAddress, USDT_BASE, 'base');
    console.log("Backend Vault Base USDT:", balBase);
    
    const balBsc = await escrowService.getVaultBalance(walletAddress, "0x55d398326f99059fF775485246999027B3197955", 'bsc');
    console.log("Backend Vault BSC USDT:", balBsc);
}

main().catch(console.error);
