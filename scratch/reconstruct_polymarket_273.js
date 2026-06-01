const fs = require('fs');
const path = require('path');

const scratchDir = '/Users/shijas/p2p father/scratch';

function reconstruct(targetTotalLines) {
    const linesMap = new Map();
    const files = fs.readdirSync(scratchDir);

    files.forEach(file => {
        if (!file.startsWith('view_response_') || !file.endsWith('.txt')) return;
        const filePath = path.join(scratchDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if this response is viewing polymarket.ts and matches target total lines
        if (!content.includes('polymarket.ts')) return;
        const totalLinesMatch = content.match(/Total Lines:\s?(\d+)/);
        if (!totalLinesMatch || parseInt(totalLinesMatch[1]) !== targetTotalLines) return;

        const lines = content.split('\n');
        lines.forEach(line => {
            const match = line.match(/^\s*(\d+):\s?(.*)$/);
            if (match) {
                const lineNum = parseInt(match[1]);
                const code = match[2];
                linesMap.set(lineNum, code);
            }
        });
    });

    if (linesMap.size === 0) {
        console.log(`No lines found for total lines = ${targetTotalLines}`);
        return;
    }

    const sortedLines = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const finalCode = [];
    let lastLine = 0;
    sortedLines.forEach(lineNum => {
        if (lineNum > lastLine + 1) {
            console.log(`[Warning] Missing lines between ${lastLine} and ${lineNum}`);
        }
        finalCode.push(linesMap.get(lineNum));
        lastLine = lineNum;
    });

    const outputPath = `/Users/shijas/p2p father/scratch/recovered_polymarket_${targetTotalLines}.ts`;
    fs.writeFileSync(outputPath, finalCode.join('\n'));
    console.log(`Reconstructed polymarket.ts (${targetTotalLines} lines) saved to: ${outputPath} (Total lines reconstructed: ${finalCode.length})`);
}

reconstruct(273);
reconstruct(267);
