const fs = require('fs');
const path = require('path');

const scratchDir = '/Users/shijas/p2p father/scratch';

function reconstruct(fileName, outputPath) {
    const linesMap = new Map();
    const files = fs.readdirSync(scratchDir);

    files.forEach(file => {
        if (!file.startsWith('view_response_') || !file.endsWith('.txt')) return;
        const filePath = path.join(scratchDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if this response is viewing the target file
        if (!content.includes(fileName)) return;

        const lines = content.split('\n');
        lines.forEach(line => {
            // Match pattern like "12:  const foo = bar;" or "12: code"
            const match = line.match(/^\s*(\d+):\s?(.*)$/);
            if (match) {
                const lineNum = parseInt(match[1]);
                const code = match[2];
                // Store the code line
                linesMap.set(lineNum, code);
            }
        });
    });

    if (linesMap.size === 0) {
        console.log(`No lines found for ${fileName}`);
        return;
    }

    const sortedLines = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const finalCode = [];
    
    // Check if there are missing lines
    let lastLine = 0;
    sortedLines.forEach(lineNum => {
        if (lineNum > lastLine + 1) {
            console.log(`[Warning] Missing lines in ${fileName} between ${lastLine} and ${lineNum}`);
        }
        finalCode.push(linesMap.get(lineNum));
        lastLine = lineNum;
    });

    fs.writeFileSync(outputPath, finalCode.join('\n'));
    console.log(`Reconstructed ${fileName} saved to: ${outputPath} (Total lines: ${finalCode.length})`);
}

reconstruct('polymarket.ts', '/Users/shijas/p2p father/scratch/recovered_polymarket_final.ts');
reconstruct('relayer.ts', '/Users/shijas/p2p father/scratch/recovered_relayer_final.ts');
