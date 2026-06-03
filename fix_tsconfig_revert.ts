import fs from 'fs';
const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
delete tsconfig.compilerOptions.exactOptionalPropertyTypes;
fs.writeFileSync('tsconfig.json', JSON.stringify(tsconfig, null, 4));
