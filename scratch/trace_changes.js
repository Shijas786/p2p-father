const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("Tracing all modifications to Predict/Predictor pages and git commands...");

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                const argsStr = JSON.stringify(tc.args);
                
                // Track write or replace tools
                if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
                    if (argsStr.includes('Predict') || argsStr.includes('Predictor')) {
                        console.log(`[Step ${obj.step_index}] ${tc.name} targetting: ${tc.args.TargetFile}`);
                    }
                }
                
                // Track git clean or git checkout or git reset or rm commands
                if (tc.name === 'run_command') {
                    const cmd = tc.args.CommandLine || "";
                    if (cmd.includes('git clean') || cmd.includes('git reset') || cmd.includes('git checkout') || cmd.includes('rm ') || cmd.includes('git restore')) {
                        console.log(`[Step ${obj.step_index}] run_command: ${cmd} (Cwd: ${tc.args.Cwd})`);
                    }
                }
            });
        }
    } catch (e) {}
}
