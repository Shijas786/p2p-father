const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2600 && obj.step_index <= 2710) {
            console.log(`\n=== Step ${obj.step_index} ===`);
            if (obj.content) console.log(obj.content.substring(0, 500));
            if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    console.log(`[Tool] ${tc.name} | Args: ${JSON.stringify(tc.args)}`);
                });
            }
        }
    } catch (e) {}
}
