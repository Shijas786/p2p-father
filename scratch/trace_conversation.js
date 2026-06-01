const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2800 && obj.step_index <= 2970) {
            if (obj.type === 'USER_INPUT') {
                console.log(`\n--- [Step ${obj.step_index}] USER INPUT ---`);
                console.log(obj.content);
            } else if (obj.type === 'PLANNER_RESPONSE' || obj.type === 'PLANNER_THOUGHT') {
                // skip thoughts to avoid noise
            } else if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    console.log(`[Step ${obj.step_index}] Tool: ${tc.name} | Args: ${JSON.stringify(tc.args)}`);
                });
            }
        }
    } catch (e) {}
}
