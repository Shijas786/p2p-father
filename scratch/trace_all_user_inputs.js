const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("=== TRACING ALL USER INPUTS IN TRANSCRIPT ===");

lines.forEach((line) => {
    if (!line.trim()) return;
    try {
        const obj = JSON.parse(line);
        if (obj.type === 'USER_INPUT') {
            console.log(`\n[Step ${obj.step_index}] USER INPUT (${obj.created_at}):`);
            console.log(obj.content);
        }
    } catch (e) {}
});
