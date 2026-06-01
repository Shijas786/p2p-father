const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("Searching edits for polymarket.ts and relayer.ts in transcript...");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                const argsStr = JSON.stringify(tc.args);
                if (argsStr.includes('polymarket.ts') || argsStr.includes('relayer.ts')) {
                    console.log(`[Step ${obj.step_index}] ${tc.name} targetting: ${tc.args.TargetFile}`);
                }
            });
        }
    } catch (e) {}
}
