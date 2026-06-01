const fs = require('fs');
const readline = require('readline');
const path = require('path');

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

            if (data.tool_calls && Array.isArray(data.tool_calls)) {
                const toolCall = data.tool_calls.find(t => t.name === 'view_file');
                if (toolCall) {
                    const pathStr = toolCall.args.AbsolutePath || '';
                    if (pathStr.includes('polymarket.ts') || pathStr.includes('relayer.ts')) {
                        console.log(`Step ${stepIndex}: view_file on ${path.basename(pathStr)}`);
                    }
                }
            }
        } catch (err) {}
    }
}

main();
