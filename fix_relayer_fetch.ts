import fs from 'fs';

let content = fs.readFileSync('src/services/relayer.ts', 'utf8');

// 1. Remove the import
content = content.replace('import { getClient } from "@relayprotocol/relay-sdk";\n', '');

// 2. Replace getQuote block
const oldQuote = `        const quote = await getClient().actions.getQuote({
            chainId: 137,
            toChainId: destChainId,
            currency: PUSD_ADDRESS,
            toCurrency: destCurrencyAddress,
            recipient: recipientAddress,
            user: depositWallet,
            amount: amountStr,
            tradeType: "EXACT_INPUT"
        });`;

const newQuote = `        const quote = await fetch("https://api.relay.link/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user: depositWallet,
                originChainId: 137,
                destinationChainId: destChainId,
                originCurrency: PUSD_ADDRESS,
                destinationCurrency: destCurrencyAddress,
                recipient: recipientAddress,
                tradeType: "EXACT_INPUT",
                amount: amountStr,
                referrer: "p2pfather",
                useExternalLiquidity: false
            })
        }).then(r => r.json());`;

content = content.replace(oldQuote, newQuote);

fs.writeFileSync('src/services/relayer.ts', content);
