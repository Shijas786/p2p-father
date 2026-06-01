const fs = require('fs');
const path = require('path');

const bundlePath = '/Users/shijas/p2p father/miniapp/dist/assets/index-Dbr3qLne.js';

async function main() {
    if (!fs.existsSync(bundlePath)) {
        console.error("Bundle file does not exist at:", bundlePath);
        return;
    }

    const content = fs.readFileSync(bundlePath, 'utf8');
    console.log(`Loaded bundle file. Length: ${content.length} characters.`);

    // Find "PRICE TO BEAT"
    const keyword = 'PRICE TO BEAT';
    let index = -1;
    let occurrences = [];
    
    while ((index = content.indexOf(keyword, index + 1)) !== -1) {
        occurrences.push(index);
    }

    console.log(`Found ${occurrences.length} occurrences of '${keyword}' at indices:`, occurrences);

    for (let i = 0; i < occurrences.length; i++) {
        const idx = occurrences[i];
        
        // Grab context: 35000 characters before and 35000 characters after
        const start = Math.max(0, idx - 35000);
        const end = Math.min(content.length, idx + 45000);
        
        const context = content.substring(start, end);
        const outPath = `/Users/shijas/p2p father/scratch/extracted_predict_context_${i}.js`;
        fs.writeFileSync(outPath, context);
        console.log(`Saved context ${i} to: ${outPath}`);
    }
}

main();
