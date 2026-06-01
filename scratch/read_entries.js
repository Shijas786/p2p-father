const fs = require('fs');
const path = require('path');

const historyDir = '/Users/shijas/Library/Application Support/Antigravity/User/History';

function getDirectories(srcpath) {
    if (!fs.existsSync(srcpath)) return [];
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(path => fs.statSync(path).isDirectory());
}

async function main() {
    const dirs = getDirectories(historyDir);
    console.log(`Found ${dirs.length} history directories.`);

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                if (resource.includes('Predict') || resource.includes('predict')) {
                    console.log(`\n================================================================================`);
                    console.log(`RESOURCE: ${resource}`);
                    console.log(`FOLDER: ${dir}`);
                    console.log(`================================================================================`);
                    const entries = data.entries || [];
                    for (const entry of entries) {
                        const date = new Date(entry.timestamp);
                        console.log(`  - ID: ${entry.id} | Timestamp: ${entry.timestamp} | Date: ${date.toLocaleString()}`);
                    }
                }
            } catch (err) {
                // Ignore
            }
        }
    }
}

main();
