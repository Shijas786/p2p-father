const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("Trace tool calls from Step 2600 to 2695:");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2600 && obj.step_index <= 2695) {
            if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    console.log(`[Step ${obj.step_index}] ${tc.name} | Args: ${JSON.stringify(tc.args)}`);
                });
            }
        }
    } catch (e) {}
}
