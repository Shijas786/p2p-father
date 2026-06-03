import fs from 'fs';

let content = fs.readFileSync('src/services/relayer.ts', 'utf8');

const withdrawCrossChainCode = `
    /**
     * Withdraw pUSD cross-chain using Relay SDK and Polymarket Biconomy Relayer natively.
     */
    async withdrawCrossChain(userWalletIndex: number, destChainId: number, destCurrencyAddress: string, recipientAddress: string, amount: bigint): Promise<string> {
        if (this.isDemoMode) {
            console.log(\`[Relayer-Demo] Simulating cross-chain withdrawal of \${amount} to chain \${destChainId}\`);
            await new Promise(r => setTimeout(r, 1500));
            return "0x_simulated_cross_chain_withdraw";
        }

        const depositWallet = await this.resolveDepositWallet(userWalletIndex);
        const amountStr = amount.toString();

        if (destChainId === 137 && destCurrencyAddress.toLowerCase() === PUSD_ADDRESS.toLowerCase()) {
            console.log("[Relayer] Destination is Polygon pUSD. Using simple withdrawGasless.");
            return await this.withdrawGasless(userWalletIndex, recipientAddress, amount);
        }

        console.log(\`[Relayer] Getting Relay quote to bridge \${amountStr} pUSD -> Chain \${destChainId}\`);
        
        const quote = await getClient().actions.getQuote({
            chainId: 137,
            toChainId: destChainId,
            currency: PUSD_ADDRESS,
            toCurrency: destCurrencyAddress,
            recipient: recipientAddress,
            user: depositWallet,
            amount: amountStr,
            tradeType: "EXACT_INPUT"
        });

        if (!quote || !quote.steps || quote.steps.length === 0) {
            throw new Error("Relay SDK did not return valid execution steps for this route.");
        }

        console.log(\`[Relayer] Relay Quote retrieved. Expected Output: \${quote.details?.currencyOut?.amountFormatted} \${quote.details?.currencyOut?.currency?.symbol}\`);

        const batchCalls = [];
        for (const step of quote.steps) {
            if (step.items) {
                for (const item of step.items) {
                    if (item.data) {
                        batchCalls.push({
                            target: item.data.to,
                            value: item.data.value ? item.data.value.toString() : "0",
                            data: item.data.data
                        });
                    }
                }
            }
        }

        console.log(\`[Relayer] Submitting batch of \${batchCalls.length} calls to Biconomy...\`);
        const client = this.getUserRelayClient(userWalletIndex);
        if (!client) throw new Error("Failed to construct relayer client");

        const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
        try {
            const response = await client.executeDepositWalletBatch(batchCalls, depositWallet, deadline);
            console.log(\`[Relayer] Biconomy Batch submitted! Hash: \${response.hash}\`);
            const result = await response.wait();
            console.log("[Relayer] Biconomy Batch mined successfully.");
            return response.hash;
        } catch (err: any) {
            console.error("[Relayer] Cross-chain withdrawal failed:", err.message);
            throw new Error(\`Cross-chain withdrawal failed: \${err.message}\`);
        }
    }
`;

const withdrawGaslessStr = 'return result.transactionHash;\n        } catch (err: any) {\n            console.error("[Relayer] pUSD withdrawal failed:", err.message);\n            throw new Error(`Gasless pUSD withdrawal failed: ${err.message}`);\n        }\n    }';

const idx = content.indexOf(withdrawGaslessStr);
if (idx !== -1) {
    const insertPos = idx + withdrawGaslessStr.length;
    content = content.substring(0, insertPos) + '\n' + withdrawCrossChainCode + content.substring(insertPos);
    fs.writeFileSync('src/services/relayer.ts', content);
    console.log("withdrawCrossChain added correctly!");
} else {
    console.log("Could not find withdrawGasless signature");
}

