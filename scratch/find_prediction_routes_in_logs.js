const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

async function main() {
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.content && (data.content.includes('/predictions/order') || data.content.includes('/predictions/bet') || data.content.includes('/predictions/deposit') || data.content.includes('placeBet') || data.content.includes('withdrawGasless'))) {
                console.log(`Step ${data.step_index || 'unknown'}:`);
                console.log(data.content.substring(0, 500));
                console.log("-----------------------------------------");
            }
        } catch (err) {}
    }
}

main();
