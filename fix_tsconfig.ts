import fs from 'fs';
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
if (!tsconfig.compilerOptions.lib.includes('DOM')) {
    tsconfig.compilerOptions.lib.push('DOM', 'DOM.Iterable');
    fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 4));
}
