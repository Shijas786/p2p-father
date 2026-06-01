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
    // Handle JSON escaped strings with newlines
    if (str.includes('\\n') || str.includes('\\"')) {
        try {
            return JSON.parse('"' + str.replace(/"/g, '\\"') + '"');
        } catch (e) {
            try {
                return JSON.parse(JSON.stringify(str));
            } catch (e2) {}
        }
    }
    return str;
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

    let index = 0;
    for await (const line of rl) {
        index++;
        try {
            const data = JSON.parse(line);
            const stepIndex = data.step_index || index;

            if (data.tool_calls && Array.isArray(data.tool_calls)) {
                for (const tool of data.tool_calls) {
                    if (tool.args) {
                        const targetFile = tool.args.TargetFile || '';
                        if (targetFile.includes('polymarket.ts') || targetFile.includes('relayer.ts')) {
                            console.log(`\n==================================================`);
                            console.log(`STEP ${stepIndex} (${tool.name}) for ${path.basename(targetFile)}`);
                            console.log(`==================================================`);
                            if (tool.name === 'write_to_file') {
                                const content = decodeIfNeeded(tool.args.CodeContent);
                                console.log("CODE CONTENT:");
                                console.log(content);
                            } else if (tool.name === 'replace_file_content') {
                                const target = decodeIfNeeded(tool.args.TargetContent);
                                const replacement = decodeIfNeeded(tool.args.ReplacementContent);
                                console.log("TARGET CONTENT:");
                                console.log(target);
                                console.log("REPLACEMENT CONTENT:");
                                console.log(replacement);
                            }
                        }
                    }
                }
            }
        } catch (err) {}
    }
}

main();
