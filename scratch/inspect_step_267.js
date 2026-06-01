const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index === 267 || obj.step_index === 268 || obj.step_index === 269) {
            console.log(`\n=== STEP ${obj.step_index} ===`);
            console.log(JSON.stringify(obj, null, 2));
        }
    } catch (e) {}
}
