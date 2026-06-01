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
    console.log(`Scanning history directories for 'p2pkerala'...`);

    const results = [];

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                if (resource.includes('p2pkerala') && (resource.includes('Predict') || resource.includes('predict'))) {
                    results.push({
                        resource,
                        folder: dir,
                        entries: data.entries || []
                    });
                }
            } catch (err) {
                // Ignore
            }
        }
    }

    console.log(`Found ${results.length} matching files in history.`);
    for (const res of results) {
        console.log(`\n================================================================================`);
        console.log(`RESOURCE: ${res.resource}`);
        console.log(`FOLDER: ${res.folder}`);
        console.log(`================================================================================`);
        for (const entry of res.entries) {
            const date = new Date(entry.timestamp);
            console.log(`  - ID: ${entry.id} | Timestamp: ${entry.timestamp} | Date: ${date.toLocaleString()}`);
        }
    }
}

main();
