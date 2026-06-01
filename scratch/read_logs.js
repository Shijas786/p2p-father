const fs = require('fs');
const path = require('path');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

if (!fs.existsSync(logPath)) {
    console.error("Log file does not exist!");
    process.exit(1);
}

const lines = fs.readFileSync(logPath, 'utf8').split('\n');
console.log(`Read ${lines.length} lines from log.`);

// Print all tool calls of type run_command
lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                if (tc.name === 'run_command') {
                    console.log(`[Step ${obj.step_index}] Cwd: ${tc.arguments.Cwd} | Cmd: ${tc.arguments.CommandLine}`);
                }
                if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
                    console.log(`[Step ${obj.step_index}] ${tc.name} on ${tc.arguments.TargetFile}`);
                }
            });
        }
    } catch (e) {
        // Ignore JSON parse errors
    }
});
