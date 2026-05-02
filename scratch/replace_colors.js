const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

// Colors
html = html.replace(/#0d1117/g, '#0b0e11');
html = html.replace(/#161b22/g, '#1e2026');
html = html.replace(/#13171e/g, '#181a20');
html = html.replace(/#1a1f2a/g, '#181a20');
html = html.replace(/#16a34a/g, '#0ecb81');
html = html.replace(/22,163,74/g, '14,203,129');
html = html.replace(/#dc2626/g, '#f6465d');
html = html.replace(/220,38,38/g, '246,70,93');
html = html.replace(/#c8922a/g, '#f0b90b'); // in phone profile
html = html.replace(/200,146,42/g, '240,185,11'); // rgba of gold

// Replace in navbar for AppKit
const navBarTarget = `<ul class="navlinks">
    <li><a href="#story">Story</a></li>
    <li><a href="#how">How it works</a></li>
    <li><a href="#miniapp">Mini App</a></li>
  </ul>
  <a class="navcta" href="https://t.me/p2pfather_bot">Open in Telegram →</a>`;

const navBarReplacement = `<ul class="navlinks">
    <li><a href="#story">Story</a></li>
    <li><a href="#how">How it works</a></li>
    <li><a href="#miniapp">Mini App</a></li>
  </ul>
  <div style="display:flex; gap:1rem; align-items:center;">
    <appkit-button></appkit-button>
    <a class="navcta" href="https://t.me/p2pfather_bot">Open in Telegram →</a>
  </div>`;

html = html.replace(navBarTarget, navBarReplacement);

// Append Reown script before </body>
const reownScript = `
<script type="module">
  import { createAppKit } from 'https://esm.sh/@reown/appkit'
  import { bsc, base } from 'https://esm.sh/@reown/appkit/networks'

  const projectId = '6dcf53c47cdea609c48bc1adb474bfd0';
  createAppKit({
      networks: [bsc, base],
      projectId,
      metadata: { name: 'P2PFather', description: 'Secure P2P Trading', url: 'https://p2pfather.com' },
      themeMode: 'light',
      themeVariables: { 
          '--w3m-accent': '#c8922a',
          '--w3m-background-color': '#ffffff'
      }
  })
</script>
</body>`;
html = html.replace('</body>', reownScript);

fs.writeFileSync('public/index.html', html);
console.log("Colors replaced and AppKit restored.");
