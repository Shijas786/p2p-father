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
            if (data.tool_calls && Array.isArray(data.tool_calls)) {
                for (const tool of data.tool_calls) {
                    if (tool.args && tool.args.TargetFile && (tool.args.TargetFile.includes('polymarket.ts') || tool.args.TargetFile.includes('relayer.ts'))) {
                        console.log("Found tool call structure:");
                        console.log(JSON.stringify({
                            name: tool.name,
                            step: data.step_index,
                            keys: Object.keys(tool.args),
                            TargetFile: tool.args.TargetFile,
                            CodeContent: tool.args.CodeContent ? tool.args.CodeContent.substring(0, 100) : undefined,
                            TargetContent: tool.args.TargetContent ? tool.args.TargetContent.substring(0, 100) : undefined,
                            ReplacementContent: tool.args.ReplacementContent ? tool.args.ReplacementContent.substring(0, 100) : undefined
                        }, null, 2));
                        break;
                    }
                }
            }
        } catch (err) {}
    }
}

main();
