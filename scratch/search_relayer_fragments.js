const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

async function main() {
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let index = 0;
    for await (const line of rl) {
        index++;
        try {
            const data = JSON.parse(line);
            const stepIndex = data.step_index || index;

            // Search in tool calls args, content, or user inputs
            let found = false;
            let snippet = '';

            const str = JSON.stringify(data);
            if (str.includes('resolveDepositWallet') || str.includes('getUserRelayClient') || str.includes('executeDepositWalletBatch')) {
                found = true;
                snippet = str.substring(0, 1000);
            }

            if (found) {
                console.log(`Step ${stepIndex}:`);
                console.log(snippet);
                console.log("-----------------------------------------");
            }
        } catch (err) {}
    }
}

main();
