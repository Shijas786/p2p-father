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
    console.log(`Scanning ${dirs.length} directories in Antigravity History...`);

    const matches = [];
    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                const resourceLower = resource.toLowerCase();
                if (resourceLower.includes('predict') || resourceLower.includes('predictor')) {
                    matches.push({
                        dir,
                        resource,
                        entries: data.entries || []
                    });
                }
            } catch (err) {}
        }
    }

    console.log(`Found ${matches.length} matching resources in History:`);
    matches.forEach(m => {
        console.log(`\nResource: ${m.resource}`);
        console.log(`Directory: ${m.dir}`);
        m.entries.forEach(e => {
            const date = new Date(e.timestamp);
            const historyFile = path.join(m.dir, e.id);
            const exists = fs.existsSync(historyFile);
            console.log(`  - ID: ${e.id} | Date: ${date.toLocaleString()} | Exists: ${exists} | Size: ${exists ? fs.statSync(historyFile).size : 0} bytes`);
        });
    });
}

main();
