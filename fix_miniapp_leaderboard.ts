import fs from 'fs';

let content = fs.readFileSync('src/api/miniapp.ts', 'utf8');

content = content.replace(
    /                \}\)\n            \);\n            for \(const r of results\) \{\n                if \(r\.status === 'fulfilled' && r\.value\) leaderboardEntries\.push\(r\.value\);\n            \}\n        \}/,
    `                })
            ));
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value) leaderboardEntries.push(r.value);
            }`
);

fs.writeFileSync('src/api/miniapp.ts', content);
