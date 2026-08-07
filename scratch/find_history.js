const fs = require('fs');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/661b13aa-5ef9-4ce7-9334-06a68f625d6d/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);

let history = { css: [], tsx: [] };

for (const line of lines) {
    try {
        const entry = JSON.parse(line);
        if (entry.tool_calls) {
            for (const call of entry.tool_calls) {
                if (call.name === 'write_to_file' || call.name === 'default_api:write_to_file') {
                    const args = call.arguments || call.args;
                    let targetFile = args?.TargetFile || '';
                    if (targetFile.includes('Rewards.css')) {
                        history.css.push({ step: entry.step_index, content: args.CodeContent, time: entry.created_at });
                    } else if (targetFile.includes('Rewards.tsx')) {
                        history.tsx.push({ step: entry.step_index, content: args.CodeContent, time: entry.created_at });
                    }
                } else if (call.name === 'replace_file_content' || call.name === 'default_api:replace_file_content') {
                    const args = call.arguments || call.args;
                    let targetFile = args?.TargetFile || '';
                    if (targetFile.includes('Rewards.css')) {
                        history.css.push({ step: entry.step_index, type: 'replace', time: entry.created_at });
                    } else if (targetFile.includes('Rewards.tsx')) {
                        history.tsx.push({ step: entry.step_index, type: 'replace', time: entry.created_at });
                    }
                }
            }
        }
    } catch (e) {}
}

console.log("Rewards.css writes:");
history.css.forEach((h, i) => console.log(`[${i}] Step: ${h.step}, Time: ${h.time}, Type: ${h.type || 'write'}, Length: ${h.content ? h.content.length : 'N/A'}`));

console.log("\nRewards.tsx writes:");
history.tsx.forEach((h, i) => console.log(`[${i}] Step: ${h.step}, Time: ${h.time}, Type: ${h.type || 'write'}, Length: ${h.content ? h.content.length : 'N/A'}`));

// Write out the first complete write for each
if (history.css.length > 0) {
    const firstCss = history.css.find(h => h.content && !h.content.includes('var(--theme-'));
    if (firstCss) fs.writeFileSync('/Users/shijas/p2p father/scratch/first_Rewards.css', firstCss.content);
    else fs.writeFileSync('/Users/shijas/p2p father/scratch/first_Rewards.css', history.css[0].content);
}

if (history.tsx.length > 0) {
    const firstTsx = history.tsx.find(h => h.content && !h.content.includes('THEMES'));
    if (firstTsx) fs.writeFileSync('/Users/shijas/p2p father/scratch/first_Rewards.tsx', firstTsx.content);
    else fs.writeFileSync('/Users/shijas/p2p father/scratch/first_Rewards.tsx', history.tsx[0].content);
}
