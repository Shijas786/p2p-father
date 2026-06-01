const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("Searching all run_command commands in transcript...");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                if (tc.name === 'run_command') {
                    const cmd = tc.args.CommandLine || "";
                    if (cmd.includes('git ') || cmd.includes('rm ') || cmd.includes('clean')) {
                        console.log(`[Step ${obj.step_index}] run_command: ${cmd}`);
                    }
                }
            });
        }
    } catch (e) {}
}
