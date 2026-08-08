const fs = require('fs');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/661b13aa-5ef9-4ce7-9334-06a68f625d6d/.system_generated/logs/transcript.jsonl';
const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);

let rewardsTsxContent = '';
let rewardsCssContent = '';
let generateThemesContent = '';

for (const line of lines) {
    try {
        const entry = JSON.parse(line);
        if (entry.tool_calls) {
            for (const call of entry.tool_calls) {
                if (call.name === 'write_to_file' || call.name === 'default_api:write_to_file') {
                    const args = call.arguments || call.args;
                    let targetFile = args?.TargetFile || '';
                    if (targetFile.includes('generate_themes.js')) {
                        generateThemesContent = args.CodeContent;
                    } else if (targetFile.includes('Rewards.css')) {
                        // We only want the version BEFORE the "wallet ui" rewrite
                        // The last rewrite was for wallet UI. We can check if it contains 'wallet-header-wave'.
                        if (!args.CodeContent.includes('wallet-header-wave')) {
                            rewardsCssContent = args.CodeContent;
                        }
                    } else if (targetFile.includes('Rewards.tsx')) {
                        if (!args.CodeContent.includes('wallet-header-wave')) {
                            rewardsTsxContent = args.CodeContent;
                        }
                    }
                }
            }
        }
    } catch (e) {}
}

if (generateThemesContent) fs.writeFileSync('/Users/shijas/p2p father/generate_themes.js', generateThemesContent);
if (rewardsCssContent) fs.writeFileSync('/Users/shijas/p2p father/miniapp/src/pages/Rewards.css', rewardsCssContent);
if (rewardsTsxContent) fs.writeFileSync('/Users/shijas/p2p father/miniapp/src/pages/Rewards.tsx', rewardsTsxContent);

console.log('Done restoring!');
