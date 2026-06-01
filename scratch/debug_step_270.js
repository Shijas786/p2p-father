const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

function decodeIfNeeded(str) {
    if (typeof str !== 'string') return str;
    if (str.startsWith('"') && str.endsWith('"')) {
        try {
            return JSON.parse(str);
        } catch (e) {
            // Fallback
        }
    }
    return str;
}

function normalize(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\r\n/g, '\n').trim();
}

async function main() {
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let currentContent = null;
    let index = 0;

    for await (const line of rl) {
        index++;
        try {
            const data = JSON.parse(line);
            const stepIndex = data.step_index || index;

            if (data.tool_calls && Array.isArray(data.tool_calls)) {
                for (const tool of data.tool_calls) {
                    if (tool.args) {
                        const targetFile = decodeIfNeeded(tool.args.TargetFile || '');
                        if (targetFile.includes('polymarket.ts')) {
                            if (tool.name === 'write_to_file') {
                                currentContent = normalize(decodeIfNeeded(tool.args.CodeContent));
                                console.log(`Step ${stepIndex}: Initialized currentContent (length ${currentContent.length})`);
                            } else if (stepIndex === 270) {
                                const targetStr = normalize(decodeIfNeeded(tool.args.TargetContent));
                                const replacementStr = normalize(decodeIfNeeded(tool.args.ReplacementContent));
                                console.log(`Step 270: replace_file_content`);
                                console.log(`  TargetContent length: ${targetStr.length}`);
                                console.log(`  ReplacementContent length: ${replacementStr.length}`);
                                console.log(`  currentContent length: ${currentContent ? currentContent.length : 'NULL'}`);
                                
                                if (currentContent) {
                                    console.log(`  currentContent starts with: ${JSON.stringify(currentContent.substring(0, 100))}`);
                                    console.log(`  TargetContent starts with: ${JSON.stringify(targetStr.substring(0, 100))}`);
                                    console.log(`  Equal? ${currentContent === targetStr}`);
                                    console.log(`  Index of TargetContent in currentContent: ${currentContent.indexOf(targetStr)}`);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {}
    }
}

main();
