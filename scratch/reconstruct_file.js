const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';
const targetFileKey = process.argv[2];
const targetStep = parseInt(process.argv[3]);

if (!targetFileKey || !targetStep) {
    console.error("Usage: node scratch/reconstruct_file.js <filename> <step_number>");
    process.exit(1);
}

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
    if (!fs.existsSync(logPath)) {
        console.error("Log file does not exist at:", logPath);
        return;
    }

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
            if (stepIndex > targetStep) {
                break;
            }

            if (data.tool_calls && Array.isArray(data.tool_calls)) {
                for (const tool of data.tool_calls) {
                    if (tool.args) {
                        const targetFile = decodeIfNeeded(tool.args.TargetFile || '');
                        if (targetFile.includes(targetFileKey)) {
                            if (tool.name === 'write_to_file') {
                                currentContent = normalize(decodeIfNeeded(tool.args.CodeContent));
                                console.log(`Step ${stepIndex}: Overwrote content using write_to_file`);
                            } else if (tool.name === 'replace_file_content') {
                                if (currentContent === null) continue;
                                const targetStr = normalize(decodeIfNeeded(tool.args.TargetContent));
                                const replacementStr = normalize(decodeIfNeeded(tool.args.ReplacementContent));
                                
                                const normCurrent = normalize(currentContent);
                                const idx = normCurrent.indexOf(targetStr);
                                if (idx !== -1) {
                                    currentContent = normCurrent.substring(0, idx) + replacementStr + normCurrent.substring(idx + targetStr.length);
                                    console.log(`Step ${stepIndex}: Replaced target content successfully`);
                                } else {
                                    console.warn(`Step ${stepIndex}: TargetContent NOT found!`);
                                }
                            } else if (tool.name === 'multi_replace_file_content') {
                                if (currentContent === null) continue;
                                let chunks = tool.args.ReplacementChunks || [];
                                if (typeof chunks === 'string') {
                                    try {
                                        chunks = JSON.parse(chunks);
                                    } catch (e) {
                                        console.error(`Step ${stepIndex}: JSON parsing chunks failed:`, e.message);
                                        // Let's try parsing it after decoding if needed
                                        try {
                                            const decoded = decodeIfNeeded(chunks);
                                            chunks = JSON.parse(decoded);
                                            console.log(`Step ${stepIndex}: Chunks parsed successfully after decoding`);
                                        } catch (e2) {
                                            console.error(`Step ${stepIndex}: JSON parsing decoded chunks also failed:`, e2.message);
                                            chunks = [];
                                        }
                                    }
                                }
                                console.log(`Step ${stepIndex}: Multi-replace processing ${chunks.length} chunks`);
                                for (const chunk of chunks) {
                                    const targetStr = normalize(decodeIfNeeded(chunk.TargetContent));
                                    const replacementStr = normalize(decodeIfNeeded(chunk.ReplacementContent));
                                    
                                    const normCurrent = normalize(currentContent);
                                    const idx = normCurrent.indexOf(targetStr);
                                    if (idx !== -1) {
                                        currentContent = normCurrent.substring(0, idx) + replacementStr + normCurrent.substring(idx + targetStr.length);
                                    } else {
                                        console.warn(`Step ${stepIndex} (chunk): TargetContent NOT found!`);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            // Ignore
        }
    }

    if (currentContent !== null) {
        console.log(`\nReconstruction finished! Length: ${currentContent.length} characters.`);
        const outputPath = `/Users/shijas/p2p father/scratch/reconstructed_${targetFileKey}`;
        fs.writeFileSync(outputPath, currentContent);
        console.log(`Saved reconstructed file to: ${outputPath}`);
    } else {
        console.log(`Could not reconstruct file.`);
    }
}

main();
