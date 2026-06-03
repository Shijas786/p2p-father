import fs from 'fs';

let content = fs.readFileSync('miniapp/src/lib/api.ts', 'utf8');
content = content.replace(
    "fetchAPI<{ success: boolean; txHash?: string, error?: string }>('/miniapp/withdraw'",
    "request<{ success: boolean; txHash?: string, error?: string }>('/miniapp/withdraw'"
);
fs.writeFileSync('miniapp/src/lib/api.ts', content);

let predictContent = fs.readFileSync('miniapp/src/pages/Predict.tsx', 'utf8');
predictContent = predictContent.replace(
    "await api.predictions.withdrawGasless(parseFloat(amount), '0x3A5668F8B3E167771d503F0321c42a7B082789Ef');",
    "await api.predictions.withdrawGasless(parseFloat(amount), 137, '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', '0x3A5668F8B3E167771d503F0321c42a7B082789Ef');"
);
fs.writeFileSync('miniapp/src/pages/Predict.tsx', predictContent);
