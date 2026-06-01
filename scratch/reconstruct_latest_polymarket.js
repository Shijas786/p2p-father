const fs = require('fs');
const path = require('path');

const scratchDir = '/Users/shijas/p2p father/scratch';
const files = [
    'view_response_2422_polymarket.ts.txt',
    'view_response_2425_polymarket.ts.txt',
    'view_response_2465_polymarket.ts.txt',
    'view_response_2492_polymarket.ts.txt',
    'view_response_2543_polymarket.ts.txt',
    'view_response_2552_polymarket.ts.txt'
];

function reconstruct() {
    const linesMap = new Map();

    files.forEach(file => {
        const filePath = path.join(scratchDir, file);
        if (!fs.existsSync(filePath)) {
            console.log(`File not found: ${file}`);
            return;
        }
        const content = fs.readFileSync(filePath, 'utf8');
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
        console.log(`No lines found for latest polymarket.ts`);
        return;
    }

    const sortedLines = Array.from(linesMap.keys()).sort((a, b) => a - b);
    const finalCode = [];
    let lastLine = 0;
    sortedLines.forEach(lineNum => {
        if (lineNum > lastLine + 1) {
            console.log(`[Warning] Missing lines in latest polymarket.ts between ${lastLine} and ${lineNum}`);
        }
        finalCode.push(linesMap.get(lineNum));
        lastLine = lineNum;
    });

    const outputPath = '/Users/shijas/p2p father/scratch/recovered_polymarket_latest.ts';
    fs.writeFileSync(outputPath, finalCode.join('\n'));
    console.log(`Reconstructed latest polymarket.ts saved to: ${outputPath} (Total lines: ${finalCode.length})`);
}

reconstruct();
