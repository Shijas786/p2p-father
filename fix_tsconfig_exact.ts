import fs from 'fs';
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
tsconfig.compilerOptions.exactOptionalPropertyTypes = true;
fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 4));
