const fs = require('fs');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        if (obj.step_index === 274) {
            console.log(`=== Step ${obj.step_index} ===`);
            if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    if (tc.name === 'write_to_file') {
                        console.log("TargetFile:", tc.args.TargetFile);
                        console.log("CodeContent length:", tc.args.CodeContent.length);
                        // Save it to a scratch file to check
                        const outPath = '/Users/shijas/p2p father/scratch/recovered_step_274_Predictor.tsx';
                        let content = tc.args.CodeContent;
                        if (content.startsWith('"') && content.endsWith('"')) {
                            content = JSON.parse(content);
                        }
                        fs.writeFileSync(outPath, content);
                        console.log(`Saved step 274 CodeContent to ${outPath}`);
                    }
                });
            }
        }
        if (obj.step_index === 2885) {
            console.log(`=== Step ${obj.step_index} ===`);
            if (obj.tool_calls) {
                obj.tool_calls.forEach(tc => {
                    if (tc.name === 'write_to_file') {
                        console.log("TargetFile:", tc.args.TargetFile);
                        console.log("CodeContent length:", tc.args.CodeContent.length);
                        // Save it to a scratch file to check
                        const outPath = '/Users/shijas/p2p father/scratch/recovered_step_2885_Predictor.css';
                        let content = tc.args.CodeContent;
                        if (content.startsWith('"') && content.endsWith('"')) {
                            content = JSON.parse(content);
                        }
                        fs.writeFileSync(outPath, content);
                        console.log(`Saved step 2885 CodeContent to ${outPath}`);
                    }
                });
            }
        }
    } catch (e) {
        console.error(e);
    }
}
