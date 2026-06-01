const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

const toolNames = new Set();
for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                toolNames.add(tc.name);
                if (tc.name.includes('run_command') || tc.name.includes('write_to_file') || tc.name.includes('replace_file_content')) {
                    console.log(`[Step ${obj.step_index}] Tool: ${tc.name} | Args: ${JSON.stringify(tc.args)}`);
                }
            });
        }
    } catch (e) {}
}
console.log("All tool names found:", Array.from(toolNames));
