const fs = require('fs');
const path = require('path');

const historyDir = '/Users/shijas/Library/Application Support/Cursor/User/History';

function getDirectories(srcpath) {
    if (!fs.existsSync(srcpath)) return [];
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(path => fs.statSync(path).isDirectory());
}

async function main() {
    const dirs = getDirectories(historyDir);
    console.log(`Scanning content of history files in ${dirs.length} directories...`);

    const keywords = ['PRICE TO BEAT', 'placingBet', 'betOutcome', 'TradingView.widget'];
    const matches = [];

    for (const dir of dirs) {
        const entriesPath = path.join(dir, 'entries.json');
        if (fs.existsSync(entriesPath)) {
            try {
                const data = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
                const resource = data.resource || '';
                
                // Let's list files in this dir
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (file === 'entries.json') continue;
                    const filePath = path.join(dir, file);
                    if (fs.statSync(filePath).isFile()) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        for (const kw of keywords) {
                            if (content.includes(kw)) {
                                matches.push({
                                    resource,
                                    file: filePath,
                                    keyword: kw,
                                    size: content.length,
                                    date: new Date(fs.statSync(filePath).mtime).toLocaleString()
                                });
                                break;
                            }
                        }
                    }
                }
            } catch (err) {}
        }
    }

    console.log(`Found ${matches.length} matching files in content search:`);
    matches.forEach(m => {
        console.log(`\nResource: ${m.resource}`);
        console.log(`File: ${m.file}`);
        console.log(`Keyword match: ${m.keyword} | Size: ${m.size} bytes | Date: ${m.date}`);
    });
}

main();
