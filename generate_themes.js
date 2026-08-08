const fs = require('fs');

const palettes = [
  { name: 'Neon Cyber', bg: '#090a0f', grad: 'radial-gradient(circle at 50% -20%, rgba(0, 255, 255, 0.15), transparent 60%)', text: '#fff', accent: '#00ffff', accentGrad: 'linear-gradient(135deg, #00ffff, #0088ff)' },
  { name: 'Toxic Sludge', bg: '#0a0d0a', grad: 'radial-gradient(circle at 50% -20%, rgba(57, 255, 20, 0.15), transparent 60%)', text: '#fff', accent: '#39ff14', accentGrad: 'linear-gradient(135deg, #39ff14, #008800)' },
  { name: 'Sunset Blaze', bg: '#0f0a0a', grad: 'radial-gradient(circle at 50% -20%, rgba(255, 87, 34, 0.15), transparent 60%)', text: '#fff', accent: '#ff5722', accentGrad: 'linear-gradient(135deg, #ff5722, #ff0055)' },
  { name: 'Abyssal Deep', bg: '#050510', grad: 'radial-gradient(circle at 50% -20%, rgba(0, 102, 255, 0.15), transparent 60%)', text: '#fff', accent: '#0066ff', accentGrad: 'linear-gradient(135deg, #0066ff, #0000ff)' },
  { name: 'Mystic Violet', bg: '#0a0510', grad: 'radial-gradient(circle at 50% -20%, rgba(153, 50, 204, 0.15), transparent 60%)', text: '#fff', accent: '#9932cc', accentGrad: 'linear-gradient(135deg, #9932cc, #ff00ff)' },
  { name: 'Dark Ember', bg: '#0d0705', grad: 'radial-gradient(circle at 50% -20%, rgba(255, 170, 0, 0.15), transparent 60%)', text: '#fff', accent: '#ffaa00', accentGrad: 'linear-gradient(135deg, #ffaa00, #ff0000)' }
];

const borderStyles = [
  { name: 'Solid Glass', cardBorder: '1px solid rgba(255,255,255,0.1)' },
  { name: 'Neon Glow', cardBorder: '1px solid currentColor' },
  { name: 'Dashed Edge', cardBorder: '1px dashed rgba(255,255,255,0.2)' },
  { name: 'Double Line', cardBorder: '3px double rgba(255,255,255,0.1)' },
  { name: 'Thick Accent', cardBorder: '2px solid currentColor' }
];

const radii = ['4px', '8px', '12px', '16px', '24px'];

let themes = [];

for (let cIdx = 0; cIdx < palettes.length; cIdx++) {
  for (let bIdx = 0; bIdx < borderStyles.length; bIdx++) {
    const c = palettes[cIdx];
    const b = borderStyles[bIdx];
    const radius = radii[(cIdx + bIdx) % radii.length];
    
    themes.push({
      name: `${c.name} - ${b.name}`,
      bg: c.bg,
      bgGradient: c.grad,
      text: c.text,
      accent: c.accent,
      accentGradient: c.accentGrad,
      cardBg: 'rgba(255, 255, 255, 0.05)',
      cardBorder: b.cardBorder,
      cardBorderLeft: `4px solid ${c.accent}`,
      radius: radius,
      cardShadow: '0 8px 32px rgba(0,0,0,0.4)',
      badgeBg: 'rgba(255, 255, 255, 0.1)',
      badgeText: c.accent,
      progressTrack: 'rgba(0,0,0,0.5)',
      progressFill: c.accentGrad,
      btnBg: c.accentGrad,
      btnText: '#fff',
      btnShadow: `0 4px 15px ${c.accent}40`,
      btnShadowActive: `0 2px 5px ${c.accent}40`,
      stepBg: 'rgba(255, 255, 255, 0.03)',
      stepBorder: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(16px)'
    });
  }
}

let fileContent = `export const THEMES = [\n`;
themes.forEach((t) => {
  fileContent += `  {\n`;
  for (const [key, val] of Object.entries(t)) {
    fileContent += `    ${key}: "${val}",\n`;
  }
  fileContent += `  },\n`;
});
fileContent += `];\n`;

fs.writeFileSync('miniapp/src/pages/RewardsThemes.ts', fileContent);
console.log('Wrote', themes.length, 'themes to RewardsThemes.ts');