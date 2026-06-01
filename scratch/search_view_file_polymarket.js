const fs = require('fs');
const path = require('path');
const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n');

console.log("=== SEARCHING VIEW_FILE CALLS FOR POLYMARKET/RELAYER ===");

let lastViewedFile = null;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const obj = JSON.parse(line);
        
        // If the last step was a view_file tool call, save this step's output (which is the tool response)
        if (lastViewedFile && obj.content) {
            const cleanPath = lastViewedFile.replace(/"/g, '').trim();
            const baseName = path.basename(cleanPath);
            const outPath = `/Users/shijas/p2p father/scratch/view_response_${obj.step_index}_${baseName}.txt`;
            try {
                fs.writeFileSync(outPath, obj.content);
                console.log(`Saved tool response for ${baseName} in Step ${obj.step_index} to: ${outPath}`);
            } catch (err) {
                console.error(`Failed to write to ${outPath}:`, err.message);
            }
            lastViewedFile = null;
        }

        if (obj.tool_calls) {
            obj.tool_calls.forEach(tc => {
                if (tc.name === 'view_file' && tc.args && tc.args.AbsolutePath) {
                    const file = tc.args.AbsolutePath;
                    if (file.includes('polymarket.ts') || file.includes('relayer.ts')) {
                        console.log(`\nFound tool call in Step ${obj.step_index} | File: ${file}`);
                        lastViewedFile = file;
                    }
                }
            });
        }
    } catch (e) {
        console.error("General error in step processing:", e.message);
    }
}
