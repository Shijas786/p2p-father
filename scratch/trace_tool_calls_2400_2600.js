const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("Trace tool calls from Step 2400 to 2600:");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2400 && obj.step_index <= 2600) {
            if (obj.type === 'USER_INPUT') {
                console.log(`\n--- [Step ${obj.step_index}] USER INPUT ---`);
                console.log(obj.content);
            }
            if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    const argsStr = JSON.stringify(tc.args);
                    if (argsStr.includes('Predict') || argsStr.includes('Predictor') || tc.name === 'run_command') {
                        console.log(`[Step ${obj.step_index}] ${tc.name} | Args: ${argsStr}`);
                    }
                });
            }
        }
    } catch (e) {}
}
