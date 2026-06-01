const { execSync } = require('child_process');
const fs = require('fs');

const commits = [
    '6d89c412d26d8fbb55186ee8f631c8e13f6eacbd',
    '974b7b78b94f67e824ee067be4f4eabc143b3a88',
    'ac4c69eb9da7fd9dc8a92f9bd7d0809482e958b1',
    '72936ac9e1eef88925ce0dd8919431f91676a4c2',
    'b5130662d761368f6ac6053298a3a3c3426f07a2',
    'ffd565a1542f1f0b79a1e6ae623ddf62a96c731c',
    'eba38acf058a0dd5d8eead14e1276c5f58f2f735',
    '58aad256bacdac779a6da97bd1a105dd5c6ceb90',
    '9dea51cbe3c1eec85596f966c3deb2a5ed8c9d5f',
    '50efeca6de80c327584d1d1e1252b5e3d96b97f0',
    'fc798c1e84b848a90a69922bd60a57b77de10cff',
    'c37ee287c3326db67619262f2cb997c554af1b53'
];

async function main() {
    console.log("Searching dangling commits for Predict files...");
    for (const commit of commits) {
        try {
            const files = execSync(`git ls-tree -r --name-only ${commit}`, { encoding: 'utf8' }).split('\n');
            const matchingFile = files.find(f => f.includes('Predictor.tsx') || f.includes('Predict.tsx') || f.includes('Predictor.css') || f.includes('Predict.css'));
            
            if (matchingFile) {
                console.log(`\n================================================================================`);
                console.log(`COMMIT ${commit} CONTAINS FILE: ${matchingFile}`);
                console.log(`================================================================================`);
                const content = execSync(`git show ${commit}:${matchingFile}`, { encoding: 'utf8' });
                console.log(content.substring(0, 1000) + "\n\n... [TRUNCATED] ...\n\n");
                
                // Write to scratch
                const safeName = matchingFile.replace(/\//g, '_');
                const outPath = `/Users/shijas/p2p father/scratch/recovered_commit_${commit}_${safeName}`;
                fs.writeFileSync(outPath, content);
                console.log(`Saved full file content to: ${outPath}`);
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

main();
