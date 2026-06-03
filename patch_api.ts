import fs from 'fs';

let content = fs.readFileSync('miniapp/src/lib/api.ts', 'utf8');

content = content.replace(
    "withdrawGasless: (amount: number, recipientAddress?: string) => \n            request<{ success: boolean; txHash: string }>('/predictions/withdraw', {\n                method: 'POST',\n                body: JSON.stringify({ amount, recipientAddress })\n            }),",
    "withdrawGasless: (amount: number, destChainId: number, destTokenAddress: string, recipient: string) => \n            fetchAPI<{ success: boolean; txHash?: string, error?: string }>('/miniapp/withdraw', {\n                method: 'POST',\n                body: JSON.stringify({ amount, destChainId, destTokenAddress, recipient })\n            }),"
);

fs.writeFileSync('miniapp/src/lib/api.ts', content);
