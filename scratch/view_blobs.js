const { execSync } = require('child_process');
const fs = require('fs');

const blobs = [
    '6f477626f771339d23ef4512558e0e4a2a139100',
    '6361b0950412ec3184fe9f89577872ac3dfc8e08',
    '7bb7cc62fcad28cffab2076016d35ecaa08f1237'
];

async function main() {
    for (const blob of blobs) {
        try {
            const content = execSync(`git cat-file -p ${blob}`, { encoding: 'utf8' });
            if (content.includes('Predictor') || content.includes('Predict')) {
                console.log(`\n================================================================================`);
                console.log(`BLOB ${blob} CONTAINS PREDICTOR/PREDICT`);
                console.log(`================================================================================`);
                console.log(content.substring(0, 1000) + "\n\n... [TRUNCATED FOR LENGTH] ...\n\n" + content.substring(content.length - 1000));
                
                // Write to a temporary file so the user can see/access it fully
                const outPath = `/Users/shijas/p2p father/scratch/recovered_blob_${blob}.tsx`;
                fs.writeFileSync(outPath, content);
                console.log(`Saved full content to: ${outPath}`);
            }
        } catch (e) {
            console.error(`Error reading blob ${blob}:`, e.message);
        }
    }
}

main();
