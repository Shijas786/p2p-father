const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

async function main() {
    if (!fs.existsSync(logPath)) {
        console.error("Log file does not exist at:", logPath);
        return;
    }

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
                for (const tool of data.tool_calls) {
                    if (tool.args) {
                        const targetFile = tool.args.TargetFile || '';
                        if (targetFile.includes('Predict') || targetFile.includes('Predictor')) {
                            console.log(`Step ${stepIndex} | ${tool.name} | File: ${targetFile} | Time: ${data.created_at || 'unknown'}`);
                        }
                    }
                }
            }
        } catch (err) {
            // Ignore
        }
    }
}

main();
