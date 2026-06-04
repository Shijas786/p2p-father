const fs = require('fs');
let code = fs.readFileSync('src/services/polymarket.ts', 'utf8');
code = code.replace(/sig = sig \+ "03"; \/\/ Polymarket requires '03' suffix for POLY_1271 signatures/g, '// sig = sig + "03"; // Removed suffix for API key auth');
fs.writeFileSync('src/services/polymarket.ts', code);
