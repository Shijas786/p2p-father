const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("=== TRACING STEPS 2600 TO 2850 ===");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2700 && obj.step_index <= 2840) {
            if (obj.type === 'USER_INPUT') {
                console.log(`\n=== [Step ${obj.step_index}] USER INPUT (${obj.created_at}) ===`);
                console.log(obj.content);
            } else if (obj.type === 'PLANNER_RESPONSE' && obj.tool_calls) {
                console.log(`\n=== [Step ${obj.step_index}] MODEL RESPONSE ===`);
                obj.tool_calls.forEach(tc => {
                    console.log(`- Tool Call: ${tc.name} | Target: ${tc.args.TargetFile || tc.args.CommandLine || ''}`);
                });
            }
        }
    } catch (e) {}
}
