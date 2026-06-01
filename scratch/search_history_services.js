const fs = require('fs');
const path = require('path');

const dirsToScan = [
    '/Users/shijas/Library/Application Support/Antigravity/User/History',
    '/Users/shijas/Library/Application Support/Cursor/User/History',
    '/Users/shijas/Library/Application Support/Code/User/History'
];

function getDirectories(srcpath) {
    if (!fs.existsSync(srcpath)) return [];
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(p => fs.statSync(p).isDirectory());
}

function scan() {
    console.log("Scanning history directories...");
    const matches = [];

    for (const historyDir of dirsToScan) {
        if (!fs.existsSync(historyDir)) {
            console.log(`Directory does not exist: ${historyDir}`);
            continue;
        }
        const dirs = getDirectories(historyDir);
        console.log(`Scanning ${dirs.length} folders in ${historyDir}...`);

        for (const dir of dirs) {
            const entriesPath = path.join(dir, 'entries.json');
            if (fs.existsSync(entriesPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                    const resource = data.resource || '';
                    if (resource.includes('polymarket.ts') || resource.includes('relayer.ts') || resource.includes('Predict.tsx')) {
                        const files = fs.readdirSync(dir);
                        for (const file of files) {
                            if (file === 'entries.json') continue;
                            const filePath = path.join(dir, file);
                            const stat = fs.statSync(filePath);
                            if (stat.isFile()) {
                                matches.push({
                                    historyDir,
                                    folder: path.basename(dir),
                                    resource,
                                    file: filePath,
                                    size: stat.size,
                                    mtime: stat.mtime
                                });
                            }
                        }
                    }
                } catch (err) {}
            }
        }
    }

    matches.sort((a, b) => b.mtime - a.mtime);

    console.log(`Found ${matches.length} matching files:`);
    matches.forEach((m, idx) => {
        console.log(`\n[${idx}] ${m.resource}`);
        console.log(`  File: ${m.file}`);
        console.log(`  Size: ${m.size} bytes | Date: ${m.mtime.toLocaleString()}`);
    });
}

scan();
