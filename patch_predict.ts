import fs from 'fs';

let predictContent = fs.readFileSync('miniapp/src/pages/Predict.tsx', 'utf8');
predictContent = predictContent.replace(
    "const r = await api.predictions.withdrawGasless(parseFloat(withdrawAmount), withdrawRecipient);",
    "const r = await api.predictions.withdrawGasless(parseFloat(withdrawAmount), 137, '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', withdrawRecipient);"
);
predictContent = predictContent.replace(
    "showToast(\`Withdrawn! \${r.txHash.slice(0, 10)}...\`, 'success');",
    "showToast(\`Withdrawn! \${r.txHash?.slice(0, 10)}...\`, 'success');"
);
fs.writeFileSync('miniapp/src/pages/Predict.tsx', predictContent);
