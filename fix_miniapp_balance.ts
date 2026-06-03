import fs from 'fs';

let content = fs.readFileSync('src/api/miniapp.ts', 'utf8');

// Replace polymarketService.getPusdBalance with polymarketRelayerService.getPusdBalance
content = content.replace(
    'const balance = await polymarketService.getPusdBalance(user.wallet_index);',
    'const { polymarketRelayerService } = await import("../services/relayer");\n        const balance = await polymarketRelayerService.getPusdBalance(user.wallet_index);'
);

fs.writeFileSync('src/api/miniapp.ts', content);
