const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index >= 2950 && obj.step_index <= 2964) {
            console.log(`\n=== Step ${obj.step_index} (${obj.source} / ${obj.type}) ===`);
            if (obj.content) {
                console.log(obj.content.substring(0, 1000));
            }
            if (obj.tool_calls) {
                console.log("Tool calls:", JSON.stringify(obj.tool_calls, null, 2));
            }
        }
    } catch (e) {}
}
