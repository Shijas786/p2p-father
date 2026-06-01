const fs = require('fs');
const readline = require('readline');

const logPath = '/Users/shijas/.gemini/antigravity-ide/brain/7a2b1d8d-a05f-4cd9-ae96-a7aa80e22876/.system_generated/logs/transcript.jsonl';

async function main() {
    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            if (data.step_index === 208) {
                const tool = data.tool_calls[0];
                const raw = tool.args.CodeContent;
                console.log("raw.length:", raw.length);
                console.log("Starts with quote:", raw.startsWith('"'));
                console.log("Ends with quote:", raw.endsWith('"'));
                console.log("First char code:", raw.charCodeAt(0), JSON.stringify(raw.charAt(0)));
                console.log("Last char code:", raw.charCodeAt(raw.length - 1), JSON.stringify(raw.charAt(raw.length - 1)));
                console.log("Last 10 characters:", JSON.stringify(raw.slice(-10)));
            }
        } catch (err) {}
    }
}

main();
