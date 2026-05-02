const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove floating phone from Hero
const heroPhoneStart = html.indexOf('<!-- Floating phone mockup (Wallet screen) -->');
if (heroPhoneStart !== -1) {
    const heroPhoneEnd = html.indexOf('</section>', heroPhoneStart);
    html = html.substring(0, heroPhoneStart) + html.substring(heroPhoneEnd);
}

// 2. Replace Mini App section
const miniAppStart = html.indexOf('<!-- MINI APP SECTION -->');
const tokensStart = html.indexOf('<!-- TOKENS -->');

const newDemoSection = `<!-- MINI APP SECTION -->
<section class="section-wide" id="miniapp">
  <div class="eyebrow r">Interactive Demo</div>
  <h2 class="miniapp-h r d1">See how easy it is to<br/>trade <em>securely</em></h2>
  <p class="miniapp-body r d2" style="max-width:500px;">
    Everything from escrow locking to Telegram broadcasting happens automatically. 
    Click through the flows below to see it in action.
  </p>

  <div class="demo-container r d3">
    <div class="demo-menu">
      <div class="demo-step active" onclick="playFlow('buy')">
        <div class="step-num" style="background:rgba(76, 175, 80, 0.2); color:#4caf50;">BUY</div>
        <div class="step-text">
          <div class="step-title">Create Buy Ad</div>
          <div class="step-desc">List a P2P offer to buy crypto</div>
        </div>
      </div>
      <div class="demo-step" onclick="playFlow('sell')">
        <div class="step-num" style="background:rgba(255, 77, 77, 0.2); color:#ff4d4d;">SELL</div>
        <div class="step-text">
          <div class="step-title">Create Sell Ad</div>
          <div class="step-desc">List a P2P offer to sell your crypto</div>
        </div>
      </div>
      <div class="demo-step" onclick="playFlow('vault')">
        <div class="step-num" style="background:rgba(255, 255, 255, 0.1); color:#fff;">+</div>
        <div class="step-text">
          <div class="step-title">Top Up Vault</div>
          <div class="step-desc">Deposit assets into the P2P Escrow Vault</div>
        </div>
      </div>
    </div>
    
    <div class="demo-phone">
      <div class="phone-shell">
        <div class="phone-screen" id="master-screen">
          <!-- Content injected by JS -->
        </div>
      </div>
    </div>
  </div>
</section>

<hr class="rule"/>

`;

if (miniAppStart !== -1 && tokensStart !== -1) {
    html = html.substring(0, miniAppStart) + newDemoSection + html.substring(tokensStart);
}

// 3. Inject CSS before </head>
const newCSS = `
/* --- DEMO CONTAINER --- */
.demo-container { display: flex; gap: 4rem; margin-top: 3rem; align-items: center; }
.demo-menu { flex: 1; display: flex; flex-direction: column; gap: 1rem; }
.demo-step {
  display: flex; align-items: flex-start; gap: 1rem; padding: 1.5rem;
  border-radius: 16px; background: var(--paper); border: 1px solid var(--rule);
  cursor: pointer; transition: all 0.3s;
}
.demo-step:hover { background: var(--paper2); }
.demo-step.active { background: #1e1e1e; border-color: #333; transform: translateX(10px); }
.step-num {
  padding: 0.3rem 0.6rem; border-radius: 6px;
  font-family: 'Space Mono', monospace; font-size: 0.7rem; font-weight: 700; flex-shrink: 0;
}
.step-title { font-family: 'DM Sans', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--ink); margin-bottom: 0.2rem; }
.demo-step.active .step-title { color: #fff; }
.step-desc { font-size: 0.85rem; color: var(--ink-soft); line-height: 1.5; }
.demo-step.active .step-desc { color: rgba(255,255,255,0.6); }

.demo-phone { width: 280px; flex-shrink: 0; filter: drop-shadow(0 24px 48px rgba(26,17,8,.15)); }
.phone-shell { background: #111; border-radius: 28px; padding: 10px; border: 1.5px solid rgba(255,255,255,.1); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }

/* --- TRUE MINIAPP UI SETTINGS --- */
:root {
  --ma-bg: #000000;
  --ma-surface: #1e1e1e;
  --ma-border: #333333;
  --ma-green: #4caf50;
  --ma-red: #ff4d4d;
  --ma-text: #ffffff;
  --ma-sub: #a0a0a0;
}

.phone-screen {
  background: var(--ma-bg); border-radius: 20px; overflow: hidden;
  position: relative; display: flex; flex-direction: column; height: 560px;
}

/* Scroll area */
.ma-content { flex: 1; overflow-y: auto; padding-bottom: 60px; }

/* Nav Bar */
.ma-nav {
  height: 56px; background: var(--ma-surface); border-top: 1px solid var(--ma-border);
  display: flex; justify-content: space-around; align-items: center; position: absolute; bottom: 0; width: 100%; z-index: 10;
}
.ma-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ma-sub); font-size: 0.55rem; }
.ma-nav-item.active { color: var(--ma-text); }
.ma-icon { width: 18px; height: 18px; background: var(--ma-sub); border-radius: 3px; }
.ma-nav-item.active .ma-icon { background: var(--ma-text); }

/* Header */
.ma-header { padding: 1rem; border-bottom: 1px solid var(--ma-border); }
.ma-title { font-size: 1.1rem; font-weight: 700; color: var(--ma-text); font-family: 'DM Sans', sans-serif;}

/* Ads Screen specific */
.ma-toggle-group { display: flex; gap: 0.5rem; padding: 1rem; }
.ma-toggle {
  flex: 1; padding: 0.6rem; text-align: center; border-radius: 8px;
  font-weight: 600; font-size: 0.8rem; background: var(--ma-surface); color: var(--ma-sub);
  border: 1px solid var(--ma-border); transition: all 0.2s;
}
.ma-toggle.buy-active { background: rgba(76, 175, 80, 0.15); color: var(--ma-green); border-color: var(--ma-green); }
.ma-toggle.sell-active { background: rgba(255, 77, 77, 0.15); color: var(--ma-red); border-color: var(--ma-red); }

.ma-label { font-size: 0.6rem; color: var(--ma-sub); text-transform: uppercase; letter-spacing: 1px; margin: 1rem 1rem 0.5rem; }
.ma-row { display: flex; gap: 0.5rem; padding: 0 1rem; }
.ma-chip { padding: 0.5rem 1rem; border-radius: 100px; border: 1px solid var(--ma-border); color: var(--ma-text); font-size: 0.75rem; background: var(--ma-surface); }
.ma-chip.active { border-color: var(--ma-text); background: rgba(255,255,255,0.1); }

.ma-input {
  margin: 0 1rem; background: var(--ma-surface); border: 1px solid var(--ma-border);
  border-radius: 8px; padding: 0.8rem; display: flex; justify-content: space-between; align-items: center;
}
.ma-input-val { color: var(--ma-text); font-size: 0.9rem; }
.ma-input-val.typing::after { content: '|'; animation: blink 1s infinite; }
.ma-input-suffix { color: var(--ma-sub); font-size: 0.7rem; font-weight: 600; }

.ma-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 0 1rem; }
.ma-method { padding: 0.6rem; border: 1px solid var(--ma-border); border-radius: 8px; text-align: center; font-size: 0.7rem; color: var(--ma-text); background: var(--ma-surface); }
.ma-method.active { border-color: var(--ma-green); background: rgba(76, 175, 80, 0.1); }

.ma-btn {
  margin: 1.5rem 1rem; padding: 0.8rem; border-radius: 12px; font-weight: 600; font-size: 0.9rem;
  text-align: center; transition: transform 0.1s;
}
.ma-btn-green { background: var(--ma-green); color: #fff; }
.ma-btn-red { background: var(--ma-red); color: #fff; }
.ma-btn-outline { border: 1px solid var(--ma-border); color: var(--ma-text); background: var(--ma-surface); margin:0;}

/* Vault Screen */
.ma-vault-card { margin: 1rem; padding: 1rem; border-radius: 12px; background: var(--ma-surface); border: 1px solid var(--ma-border); }
.ma-bal-lbl { font-size: 0.65rem; color: var(--ma-sub); text-transform: uppercase; }
.ma-bal-val { font-size: 1.8rem; font-weight: 700; color: var(--ma-text); margin: 0.3rem 0; }
.ma-bal-btn { background: var(--ma-green); color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600; display: inline-block;}

.ma-modal {
  position: absolute; inset: 0; background: rgba(0,0,0,0.8); z-index: 100;
  display: flex; flex-direction: column; justify-content: flex-end;
  opacity: 0; animation: fadeOverlay 0.3s forwards;
}
.ma-modal-content { background: var(--ma-surface); border-radius: 20px 20px 0 0; padding: 1.5rem 1rem; transform: translateY(100%); animation: slidePopup 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

/* Cursors */
.demo-cursor {
  position: absolute; width: 22px; height: 22px; z-index: 200; pointer-events: none;
  background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.24c.45 0 .67-.54.35-.85L6.35 3.56a.5.5 0 0 0-.85.35Z" fill="white" stroke="%231a1108" stroke-width="1.5"/></svg>');
  background-size: contain; opacity: 0; transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s;
}

@keyframes clickAnim { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(0.95); filter: brightness(1.2); } }
.btn-clicked { animation: clickAnim 0.3s ease; }
@keyframes fadeOverlay { to { opacity: 1; } }
@keyframes slidePopup { to { transform: translateY(0); } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@media(max-width:900px){ .demo-container { flex-direction: column; } .demo-phone { margin: 0 auto; } }
</style>
`;
html = html.replace('</head>', newCSS + '</head>');

// 4. Inject JS before </body>
const jsScript = `<script>
// --- TRUE MINIAPP DEMO ENGINE ---
let demoTimeouts = [];

function clearDemo() {
  demoTimeouts.forEach(clearTimeout);
  demoTimeouts = [];
}

function renderNav(activeTab) {
  return \`
    <div class="ma-nav">
      <div class="ma-nav-item \${activeTab === 'p2p' ? 'active' : ''}"><div class="ma-icon"></div>P2P</div>
      <div class="ma-nav-item \${activeTab === 'orders' ? 'active' : ''}"><div class="ma-icon"></div>Orders</div>
      <div class="ma-nav-item \${activeTab === 'ads' ? 'active' : ''}"><div class="ma-icon"></div>Ads</div>
      <div class="ma-nav-item \${activeTab === 'wallet' ? 'active' : ''}"><div class="ma-icon"></div>Wallet</div>
      <div class="ma-nav-item \${activeTab === 'profile' ? 'active' : ''}"><div class="ma-icon"></div>Profile</div>
    </div>
  \`;
}

function playFlow(flow) {
  clearDemo();
  
  // update menu highlight
  document.querySelectorAll('.demo-step').forEach(el => {
    if (el.getAttribute('onclick').includes(flow)) el.classList.add('active');
    else el.classList.remove('active');
  });

  const screen = document.getElementById('master-screen');
  
  if (flow === 'buy' || flow === 'sell') {
    const isBuy = flow === 'buy';
    const colorClass = isBuy ? 'buy-active' : 'sell-active';
    const btnClass = isBuy ? 'ma-btn-green' : 'ma-btn-red';
    const activeText = isBuy ? 'BUY' : 'SELL';
    
    // Screen 1: Trade Setup
    screen.innerHTML = \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content">
        <div class="ma-header"><div class="ma-title">Create Ad</div></div>
        <div class="ma-toggle-group">
          <div class="ma-toggle \${isBuy ? colorClass : ''}">BUY</div>
          <div class="ma-toggle \${!isBuy ? colorClass : ''}">SELL</div>
        </div>
        <div class="ma-label">Select Network</div>
        <div class="ma-row">
          <div class="ma-chip active">Base</div><div class="ma-chip">BSC</div>
        </div>
        <div class="ma-label">Select Token</div>
        <div class="ma-row">
          <div class="ma-chip active">USDC</div><div class="ma-chip">USDT</div>
        </div>
        <div class="ma-btn \${btnClass}" id="btn-next">Next Step</div>
      </div>
      \${renderNav('ads')}
    \`;

    const c = document.getElementById('cursor');
    const nxt = document.getElementById('btn-next');

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(140px, 320px)'; }, 500));
    demoTimeouts.push(setTimeout(() => { nxt.classList.add('btn-clicked'); }, 1200));
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 1300));
    
    // Screen 2: Form Details
    demoTimeouts.push(setTimeout(() => {
      screen.innerHTML = \`
        <div class="demo-cursor" id="cursor"></div>
        <div class="ma-content">
          <div class="ma-header"><div style="font-size:0.7rem; color:var(--ma-sub);">Step 2/2</div><div class="ma-title">Set Details</div></div>
          
          <div class="ma-label">\${activeText} AMOUNT</div>
          <div class="ma-input"><div class="ma-input-val" id="type-amt"></div><div class="ma-input-suffix">USDC</div></div>
          
          <div class="ma-label">RATE (INR)</div>
          <div class="ma-input"><div class="ma-input-val">89.20</div><div class="ma-input-suffix">₹</div></div>
          
          <div class="ma-label">PAYMENT METHODS</div>
          <div class="ma-methods">
            <div class="ma-method active">UPI</div><div class="ma-method active">IMPS</div>
            <div class="ma-method">Bank Transfer</div>
          </div>
          
          <div class="ma-btn \${btnClass}" id="btn-pub">PUBLISH AD</div>
        </div>
        \${renderNav('ads')}
      \`;
      
      const c2 = document.getElementById('cursor');
      const amt = document.getElementById('type-amt');
      const pub = document.getElementById('btn-pub');
      
      demoTimeouts.push(setTimeout(() => { c2.style.opacity = '1'; c2.style.transform = 'translate(140px, 110px)'; }, 500));
      demoTimeouts.push(setTimeout(() => { amt.classList.add('typing'); }, 1100));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "1"; }, 1500));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "10"; }, 1700));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "100"; amt.classList.remove('typing'); }, 1900));
      demoTimeouts.push(setTimeout(() => { c2.style.transform = 'translate(140px, 450px)'; }, 2400));
      demoTimeouts.push(setTimeout(() => { pub.classList.add('btn-clicked'); }, 3100));
      demoTimeouts.push(setTimeout(() => { c2.style.opacity = '0'; }, 3200));

    }, 1500));
    
  } else if (flow === 'vault') {
    screen.innerHTML = \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content">
        <div class="ma-header"><div class="ma-title">Wallet</div></div>
        <div class="ma-vault-card">
          <div class="ma-bal-lbl">P2P Escrow Vault</div>
          <div class="ma-bal-val">0.00 USDC</div>
          <div class="ma-row" style="padding:0; margin-top:1rem; gap:1rem; justify-content:flex-start;">
            <div class="ma-bal-btn" id="btn-topup">+ Top Up</div>
            <div class="ma-btn-outline" style="padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.75rem;">Withdraw</div>
          </div>
        </div>
      </div>
      \${renderNav('wallet')}
      <div class="ma-modal" id="modal" style="display:none; opacity:0;">
        <div class="ma-modal-content">
          <div style="font-size:1.1rem; font-weight:700; color:#fff; margin-bottom:1rem;">Top Up Vault</div>
          
          <div class="ma-label" style="margin:0 0 0.5rem;">SELECT CHAIN</div>
          <div class="ma-row" style="padding:0; margin-bottom:1rem;">
            <div class="ma-chip active">Base</div><div class="ma-chip">BSC</div>
          </div>
          
          <div class="ma-label" style="margin:0 0 0.5rem;">AMOUNT</div>
          <div class="ma-input" style="margin:0;"><div class="ma-input-val typing" id="v-amt"></div><div class="ma-input-suffix">USDC</div></div>
          
          <div class="ma-btn ma-btn-green" style="margin:1.5rem 0 0;" id="btn-conf">CONFIRM DEPOSIT</div>
        </div>
      </div>
    \`;

    const c = document.getElementById('cursor');
    const topup = document.getElementById('btn-topup');
    const modal = document.getElementById('modal');

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(80px, 140px)'; }, 500));
    demoTimeouts.push(setTimeout(() => { topup.classList.add('btn-clicked'); }, 1200));
    
    demoTimeouts.push(setTimeout(() => { 
      modal.style.display = 'flex';
      modal.style.opacity = '1'; // triggers animation from CSS
      c.style.transform = 'translate(140px, 320px)';
    }, 1400));

    const vamt = document.getElementById('v-amt');
    const conf = document.getElementById('btn-conf');

    demoTimeouts.push(setTimeout(() => { vamt.innerText = "5"; }, 2300));
    demoTimeouts.push(setTimeout(() => { vamt.innerText = "50"; }, 2500));
    demoTimeouts.push(setTimeout(() => { vamt.innerText = "500"; vamt.classList.remove('typing'); }, 2700));
    
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(140px, 420px)'; }, 3200));
    demoTimeouts.push(setTimeout(() => { conf.classList.add('btn-clicked'); }, 3900));
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 4000));
  }
}

// Start first flow
setTimeout(() => playFlow('buy'), 500);
</script>

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
          '--w3m-accent': '#f0b90b',
          '--w3m-background-color': '#ffffff'
      }
  })
</script>
`;

html = html.replace('</body>', jsScript + '\n</body>');

// Replace AppKit in nav
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

fs.writeFileSync('public/index.html', html);
console.log("Safe True Miniapp Demo successfully built.");
