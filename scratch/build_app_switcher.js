const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const newCSS = `/* --- DEMO CONTAINER --- */
.demo-container { display: flex; gap: 4rem; margin-top: 3rem; align-items: center; }
.demo-menu { flex: 1; display: flex; flex-direction: column; gap: 1rem; }
.demo-step { display: flex; align-items: flex-start; gap: 1rem; padding: 1.5rem; border-radius: 16px; background: var(--paper); border: 1px solid var(--rule); cursor: pointer; transition: all 0.3s; }
.demo-step:hover { background: var(--paper2); }
.demo-step.active { background: #1e1e1e; border-color: #333; transform: translateX(10px); }
.step-num { padding: 0.3rem 0.6rem; border-radius: 6px; font-family: 'Space Mono', monospace; font-size: 0.7rem; font-weight: 700; flex-shrink: 0; }
.step-title { font-family: 'DM Sans', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--ink); margin-bottom: 0.2rem; }
.demo-step.active .step-title { color: #fff; }
.step-desc { font-size: 0.85rem; color: var(--ink-soft); line-height: 1.5; }
.demo-step.active .step-desc { color: rgba(255,255,255,0.6); }

.demo-phone { width: 300px; flex-shrink: 0; filter: drop-shadow(0 30px 60px rgba(0,0,0,.25)); }
.phone-shell { background: #0f0f11; border-radius: 40px; padding: 12px; box-shadow: inset 0 0 0 2px #3a3a3c, inset 0 0 0 6px #121212; position: relative; overflow: hidden; }
.phone-screen { background: #000; border-radius: 30px; overflow: hidden; position: relative; display: flex; flex-direction: column; height: 600px; }
.notch { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); width: 90px; height: 26px; background: #000; border-radius: 20px; z-index: 999; box-shadow: 0 0 0 1px rgba(255,255,255,0.05); }

/* iOS App Layers */
.app-layer { position: absolute; inset: 0; background: var(--ma-bg); display: flex; flex-direction: column; overflow: hidden; transition: transform 0.6s cubic-bezier(0.32, 0.72, 0, 1); }

/* --- TRUE MINIAPP UI SETTINGS --- */
:root { --ma-bg: #0b0e11; --ma-surface: #1e2026; --ma-border: #2a2d35; --ma-green: #0ecb81; --ma-red: #f6465d; --ma-text: #ffffff; --ma-sub: #848e9c; }
.ma-content { flex: 1; overflow-y: auto; padding: 34px 0 60px 0; scroll-behavior: smooth; }
.ma-nav { height: 60px; background: rgba(11, 14, 17, 0.95); backdrop-filter: blur(10px); border-top: 1px solid var(--ma-border); display: flex; justify-content: space-around; align-items: center; position: absolute; bottom: 0; width: 100%; z-index: 10; }
.ma-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ma-sub); font-size: 0.55rem; font-weight: 500; }
.ma-nav-item.active { color: var(--ma-text); }
.ma-nav-item svg { width: 22px; height: 22px; fill: none; stroke: var(--ma-sub); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ma-nav-item.active svg { stroke: var(--ma-text); }
.ma-header { padding: 1rem; }
.ma-title { font-size: 1.2rem; font-weight: 700; color: var(--ma-text); font-family: 'DM Sans', sans-serif;}
.ma-subtitle { font-size: 0.75rem; color: var(--ma-sub); margin-top: 0.2rem; }

/* My Ads Screen */
.ma-tabs { display: flex; border-bottom: 1px solid var(--ma-border); padding: 0 1rem; gap: 1.5rem; }
.ma-tab { color: var(--ma-sub); font-size: 0.8rem; font-weight: 600; padding: 0.8rem 0; cursor: pointer; }
.ma-tab.active { color: var(--ma-text); border-bottom: 2px solid #f0b90b; }
.fab { position: absolute; bottom: 80px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: #f0b90b; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: #000; box-shadow: 0 4px 12px rgba(240, 185, 11, 0.3); z-index: 20; transition: transform 0.2s; }
.fab:active { transform: scale(0.9); }

.ad-card { margin: 1rem; background: var(--ma-surface); border: 1px solid var(--ma-border); border-radius: 12px; padding: 1rem; opacity:0; animation: fadeOverlay 0.3s forwards;}
.ad-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem; }
.ad-type { display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: 700; color: #fff; }
.ad-badge { font-size: 0.6rem; padding: 0.2rem 0.4rem; border-radius: 4px; font-weight: 700; }
.ad-badge.sell { color: var(--ma-red); background: rgba(246, 70, 93, 0.15); }
.ad-badge.buy { color: var(--ma-green); background: rgba(14, 203, 129, 0.15); }
.ad-status { color: var(--ma-green); font-size: 0.6rem; font-weight: 700; background: rgba(14, 203, 129, 0.1); padding: 0.2rem 0.4rem; border-radius: 4px; letter-spacing: 0.5px;}
.ad-price { font-size: 1.2rem; font-weight: 700; color: #fff; margin-bottom: 1rem; display:flex; align-items:baseline; gap:0.2rem;}
.ad-price span { font-size:0.7rem; color:var(--ma-sub); font-weight:500;}
.ad-row { display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 0.5rem; }
.ad-lbl { color: var(--ma-sub); }
.ad-val { color: #fff; font-weight: 500; }
.ad-method { background: #2a2d35; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.65rem; }
.ad-time { color: #f0b90b; font-size: 0.7rem; display:flex; align-items:center; gap:0.3rem;}
.ad-cancel-btn { margin-top: 1rem; background: rgba(246, 70, 93, 0.1); color: var(--ma-red); text-align: center; padding: 0.8rem; border-radius: 8px; font-weight: 600; font-size: 0.8rem; }

/* Ads Form specific */
.ma-label { font-size: 0.65rem; color: var(--ma-sub); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; margin: 1.5rem 1rem 0.5rem; }
.ma-toggle-group { display: flex; gap: 0.5rem; padding: 0 1rem; }
.ma-toggle { flex: 1; padding: 0.8rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border-radius: 8px; font-weight: 700; font-size: 0.8rem; background: var(--ma-surface); color: var(--ma-text); border: 1px solid var(--ma-border); transition: all 0.2s; }
.ma-dot { width: 8px; height: 8px; border-radius: 50%; }
.ma-dot.red { background: var(--ma-red); }
.ma-dot.green { background: var(--ma-green); }
.ma-toggle.buy-active { border-color: var(--ma-green); background: rgba(14, 203, 129, 0.05); }
.ma-toggle.sell-active { border-color: var(--ma-red); background: rgba(246, 70, 93, 0.05); }

.ma-input { margin: 0 1rem; background: var(--ma-surface); border: 1px solid var(--ma-border); border-radius: 8px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; }
.ma-input-val { color: var(--ma-text); font-size: 1rem; font-weight: 600; }
.ma-input-val.typing::after { content: '|'; animation: blink 1s infinite; }
.ma-input-suffix { color: var(--ma-sub); font-size: 0.8rem; font-weight: 700; }
.ma-chip { padding: 0.8rem 0; flex: 1; text-align: center; border: 1px solid var(--ma-border); color: var(--ma-text); font-weight: 600; font-size: 0.8rem; background: var(--ma-surface); border-radius: 8px; transition: all 0.2s; }
.ma-chip.active { background: var(--ma-green); color: #000; border-color: var(--ma-green); }
.ma-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 0 1rem; }
.ma-method { padding: 0.8rem; border: 1px solid var(--ma-border); border-radius: 8px; text-align: center; font-weight: 600; font-size: 0.75rem; color: var(--ma-text); background: var(--ma-surface); }
.ma-method.active { border-color: var(--ma-green); background: rgba(14, 203, 129, 0.05); }
.ma-btn { margin: 2rem 1rem; padding: 1rem; border-radius: 8px; font-weight: 700; font-size: 0.95rem; text-align: center; transition: all 0.2s; }
.ma-btn-green { background: var(--ma-green); color: #000; }
.ma-btn-red { background: var(--ma-red); color: #fff; }

/* Wallet Screen */
.aw-hero { padding: 0 1rem; margin-bottom: 1rem; }
.aw-label { font-size: 0.65rem; color: var(--ma-sub); text-transform: uppercase; font-weight: 600;}
.aw-amount { font-size: 2rem; font-weight: 700; color: #fff; margin: 0.2rem 0; }
.aw-inr { font-size: 0.7rem; color: var(--ma-sub); }
.aw-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
.aw-dep { background: rgba(255,255,255,0.1); color: #fff; border-radius: 8px; padding: 0.6rem 1rem; font-size: 0.8rem; font-weight: 600; flex:1; text-align:center;}
.aw-send { background: var(--ma-text); color: #000; border-radius: 8px; padding: 0.6rem 1rem; font-size: 0.8rem; font-weight: 700; flex:1; text-align:center;}
.ma-vault-card { margin: 0 1rem; padding: 1rem; border-radius: 12px; background: var(--ma-surface); border: 1px solid var(--ma-border); }
.ma-bal-lbl { font-size: 0.7rem; color: #fff; font-weight: 600; display:flex; align-items:center; gap:0.4rem; }
.ma-bal-val { font-size: 1.4rem; font-weight: 700; color: var(--ma-text); margin: 0.5rem 0; transition: color 0.3s; }
.ma-bal-btn { background: var(--ma-green); color: #000; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-block;}
.ma-btn-outline { border: 1px solid var(--ma-border); color: var(--ma-text); padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.75rem; font-weight: 600; }
.aw-assets-hd { font-size: 0.8rem; font-weight: 700; color: #fff; padding: 1.5rem 1rem 0.5rem; }
.aw-asset-row { display: flex; justify-content: space-between; align-items: center; padding: 0.8rem 1rem; border-bottom: 1px solid var(--ma-border); }
.aw-asset-left { display: flex; align-items: center; gap: 0.6rem; }
.aw-asset-ico { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #fff; }
.aw-asset-nm { font-size: 0.8rem; font-weight: 600; color: #fff; }
.aw-asset-ch { font-size: 0.6rem; color: var(--ma-sub); }
.aw-asset-bal { font-size: 0.8rem; font-weight: 700; color: #fff; text-align: right; }
.aw-asset-usd { font-size: 0.6rem; color: var(--ma-sub); text-align: right; }

.ma-modal { position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; display: flex; flex-direction: column; justify-content: flex-end; opacity: 0; animation: fadeOverlay 0.3s forwards; }
.ma-modal-content { background: var(--ma-surface); border-radius: 20px 20px 0 0; padding: 2rem 1.5rem; transform: translateY(100%); animation: slidePopup 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.mm-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); z-index: 150; display: flex; align-items: center; justify-content: center; opacity: 0; animation: fadeOverlay 0.2s forwards; }
.mm-popup { background: #fff; width: 85%; border-radius: 16px; padding: 1.5rem; transform: scale(0.9); animation: popMsg 0.3s cubic-bezier(0.17, 0.89, 0.32, 1.28) forwards; }
.mm-logo { width: 40px; height: 40px; background: url('https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg') center/contain no-repeat; margin: 0 auto 1rem; }
.mm-title { font-size: 1.1rem; font-weight: 700; color: #000; text-align: center; margin-bottom: 0.5rem; }
.mm-sub { font-size: 0.8rem; color: #666; text-align: center; margin-bottom: 1.5rem; }
.mm-btn { background: #037dd6; color: #fff; border-radius: 100px; padding: 0.8rem; text-align: center; font-weight: 600; font-size: 0.9rem; }

/* Rabby specific */
.rw-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); z-index: 150; display: flex; flex-direction: column; justify-content: flex-end; opacity: 0; animation: fadeOverlay 0.2s forwards; }
.rw-popup { background: #fff; border-radius: 16px 16px 0 0; padding: 1rem 1.5rem 1.5rem; transform: translateY(100%); animation: slidePopup 0.3s forwards; }
.rw-header { display: flex; align-items: center; gap: 0.5rem; justify-content: center; font-size: 0.85rem; font-weight: 600; color: #000; margin-bottom: 1.5rem; }
.rw-header img { width: 20px; height: 20px; border-radius: 4px; }
.rw-row { background: #f5f6f8; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; }
.rw-row-title { font-size: 0.8rem; color: #000; font-weight: 600; margin-bottom: 0.5rem; }
.rw-row-val { font-size: 1.1rem; font-weight: 700; color: #f6465d; display:flex; align-items:center; gap:0.5rem;}
.rw-row-val svg { width:18px; height:18px; fill:#2775ca; }
.rw-detail { display: flex; justify-content: space-between; font-size: 0.8rem; color: #666; margin-bottom: 0.5rem; }
.rw-detail span { color: #000; font-weight: 600; }
.rw-btn { background: #4d7cff; color: #fff; border-radius: 8px; padding: 0.8rem; text-align: center; font-weight: 600; font-size: 0.9rem; margin-top: 1rem; }

.toast { position: absolute; top: 40px; left: 50%; transform: translateX(-50%) translateY(-20px); background: #2e7d32; color: #fff; padding: 0.6rem 1rem; border-radius: 100px; font-size: 0.8rem; font-weight: 600; z-index: 200; opacity: 0; transition: all 0.3s; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.5); }
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Telegram Screen */
.tg-bg { background: #000; width:100%; height:100%; display: flex; flex-direction: column; }
.tg-header { background: #17212b; padding: 40px 1rem 0.8rem; display: flex; align-items: center; gap: 0.8rem; box-shadow: 0 1px 2px rgba(0,0,0,0.5);}
.tg-ava { width: 42px; height: 42px; border-radius: 50%; background: #2b5278; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; overflow:hidden;}
.tg-ava img { width:100%; height:100%; object-fit:cover; }
.tg-title { color: #fff; font-weight: 600; font-size: 1.05rem; }
.tg-sub { color: #7f91a4; font-size: 0.75rem; }
.tg-chat { flex: 1; padding: 1rem; background: url('https://web.telegram.org/a/chat-bg-pattern-dark.png') center/cover; display:flex; flex-direction:column; justify-content:flex-end; }
.tg-msg { background: #182533; border-radius: 12px 12px 12px 0; width: 92%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.95); transform-origin: left bottom; animation: popMsg 0.4s 0.3s forwards cubic-bezier(0.17, 0.89, 0.32, 1.28); display:flex; flex-direction:column; margin-bottom:1rem;}
.tg-msg-inner { padding: 0.8rem; }
.tg-msg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
.tg-msg-title { color: #e19036; font-weight: 700; font-size: 0.85rem; }
.tg-msg-bot { color: #7f91a4; font-size: 0.7rem; }
.tg-msg-text { color: #fff; font-size: 0.85rem; line-height: 1.6; }
.tg-msg-time { color: rgba(255,255,255,0.4); font-size: 0.6rem; text-align: right; margin-top:0.4rem;}
.tg-inline-btn { margin: 0; background: rgba(43, 30, 68, 0.95); border: 1px solid rgba(255,255,255,0.05); padding: 0.75rem; text-align: center; font-size: 0.85rem; font-weight: 700; border-radius: 0 0 12px 12px; border-top: 1px solid rgba(0,0,0,0.3); color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5);}

/* Cursors */
.demo-cursor { position: absolute; width: 24px; height: 24px; z-index: 250; pointer-events: none; background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.24c.45 0 .67-.54.35-.85L6.35 3.56a.5.5 0 0 0-.85.35Z" fill="white" stroke="%231a1108" stroke-width="1.5"/></svg>'); background-size: contain; opacity: 0; transition: transform 0.8s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s; }
@keyframes clickAnim { 0%, 100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(0.95); filter: brightness(1.2); } }
.btn-clicked { animation: clickAnim 0.3s ease; }
@keyframes fadeOverlay { to { opacity: 1; } }
@keyframes slidePopup { to { transform: translateY(0); } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes popMsg { to { opacity: 1; transform: scale(1); } }
@media(max-width:900px){ .demo-container { flex-direction: column; } .demo-phone { margin: 0 auto; } }
`;

const jsScript = `// --- TRUE MINIAPP DEMO ENGINE ---
let demoTimeouts = [];

function clearDemo() {
  demoTimeouts.forEach(clearTimeout);
  demoTimeouts = [];
}

const icons = {
  p2p: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
};

function renderNav(activeTab) {
  return \`
    <div class="ma-nav">
      <div class="ma-nav-item \${activeTab === 'p2p' ? 'active' : ''}">\${icons.p2p}P2P</div>
      <div class="ma-nav-item \${activeTab === 'orders' ? 'active' : ''}">\${icons.orders}Orders</div>
      <div class="ma-nav-item \${activeTab === 'ads' ? 'active' : ''}">\${icons.ads}Ads</div>
      <div class="ma-nav-item \${activeTab === 'wallet' ? 'active' : ''}">\${icons.wallet}Wallet</div>
      <div class="ma-nav-item \${activeTab === 'profile' ? 'active' : ''}">\${icons.profile}Profile</div>
    </div>
  \`;
}

function playFlow(flow) {
  clearDemo();
  
  document.querySelectorAll('.demo-step').forEach(el => {
    if (el.getAttribute('onclick').includes(flow)) el.classList.add('active');
    else el.classList.remove('active');
  });

  if (flow === 'vault') {
    document.querySelector('.demo-step[onclick="playFlow(\\'vault\\')"] .step-title').innerText = "Deposit Funds";
    document.querySelector('.demo-step[onclick="playFlow(\\'vault\\')"] .step-desc').innerText = "Connect wallet to deposit assets";
  }

  const screen = document.getElementById('master-screen');
  const notch = '<div class="notch"></div><div class="toast" id="toast"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Deposit Successful!</div>';
  
  // Dual OS App Layers
  screen.innerHTML = notch + \`
    <div class="app-layer" id="app-miniapp" style="transform: translateX(0);"></div>
    <div class="app-layer" id="app-telegram" style="transform: translateX(100%);"></div>
  \`;
  
  const miniappLayer = document.getElementById('app-miniapp');
  const telegramLayer = document.getElementById('app-telegram');

  if (flow === 'buy' || flow === 'sell') {
    const isBuy = flow === 'buy';
    const colorClass = isBuy ? 'buy-active' : 'sell-active';
    const btnClass = isBuy ? 'ma-btn-green' : 'ma-btn-red';
    const activeText = isBuy ? 'BUY' : 'SELL';
    
    // START: My Ads Screen (Empty State)
    miniappLayer.innerHTML = \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content" id="form-scroll">
        <div class="ma-header"><div class="ma-title">My Ads</div></div>
        <div class="ma-tabs">
          <div class="ma-tab active">Active (0)</div>
          <div class="ma-tab">History</div>
        </div>
        <div id="ad-list"></div>
        <div class="fab" id="btn-fab">+</div>
      </div>
      \${renderNav('ads')}
      <!-- Rabby Overlay specifically for SELL flow -->
      <div class="rw-overlay" id="rw-overlay" style="display:none;">
        <div class="rw-popup">
          <div class="rw-header"><img src="favicon.png" /> https://p2pfather.com</div>
          <div class="rw-row">
            <div class="rw-row-title">Simulation Results</div>
            <div class="rw-row-val"><svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg> - 25.0800 USDC</div>
          </div>
          <div class="rw-detail">Unknown Signature Type <span>View Raw ></span></div>
          <div class="rw-detail" style="margin-top:1rem;">Chain <span>BNB Chain</span></div>
          <div class="rw-detail" style="margin-top:0.5rem; padding-bottom:1rem; border-bottom:1px solid #eee;">Operation <span>deposit</span></div>
          <div class="rw-btn" id="btn-rw-sign">Sign</div>
        </div>
      </div>
    \`;

    const c = document.getElementById('cursor');
    const fab = document.getElementById('btn-fab');
    const scrollArea = document.getElementById('form-scroll');

    // Click FAB
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(250px, 480px)'; }, 800));
    demoTimeouts.push(setTimeout(() => { fab.classList.add('btn-clicked'); }, 2000));
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 2200));

    // Screen 1: Trade Setup
    demoTimeouts.push(setTimeout(() => {
      scrollArea.innerHTML = \`
        <div class="ma-header">
          <div class="ma-title">Create Ad</div>
          <div class="ma-subtitle">List your buy/sell order on the marketplace</div>
        </div>
        
        <div class="ma-label">1. TRADE TYPE</div>
        <div class="ma-toggle-group">
          <div class="ma-toggle \${!isBuy ? 'sell-active' : ''}"><div class="ma-dot red"></div> SELL</div>
          <div class="ma-toggle \${isBuy ? 'buy-active' : ''}"><div class="ma-dot green"></div> BUY</div>
        </div>
        
        <div class="ma-label">2. NETWORK</div>
        <div class="ma-toggle-group">
          <div class="ma-chip active">Base</div>
          <div class="ma-chip">BSC</div>
        </div>
        
        <div class="ma-label">3. TOKEN</div>
        <div class="ma-toggle-group">
          <div class="ma-chip active">USDC</div>
          <div class="ma-chip">USDT</div>
        </div>
        
        <div class="ma-btn ma-btn-green" id="btn-next">Next Step ➡️</div>
      \`;

      const nxt = document.getElementById('btn-next');
      demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(150px, 460px)'; }, 1000));
      demoTimeouts.push(setTimeout(() => { nxt.classList.add('btn-clicked'); }, 2200));
      demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 2400));
      
      // Screen 2: Form Details
      demoTimeouts.push(setTimeout(() => {
        scrollArea.innerHTML = \`
          <div class="ma-header"><div class="ma-subtitle">Step 2/2</div><div class="ma-title">Set Details</div></div>
          
          <div class="ma-label">\${activeText} AMOUNT</div>
          <div class="ma-input"><div class="ma-input-val" id="type-amt"></div><div class="ma-input-suffix">USDC</div></div>
          
          <div class="ma-label">RATE (INR)</div>
          <div class="ma-input"><div class="ma-input-val">\${isBuy ? '98.00' : '98.50'}</div><div class="ma-input-suffix">₹</div></div>
          
          <div class="ma-label">PAYMENT METHODS</div>
          <div class="ma-methods">
            <div class="ma-method active">DIGITAL_RUPEE</div><div class="ma-method">UPI</div>
          </div>

          <div class="ma-label">TIME LIMIT</div>
          <div class="ma-input"><div class="ma-input-val">15 Minutes</div><div class="ma-input-suffix">▼</div></div>

          <div class="ma-label">NOTE</div>
          <div class="ma-input"><div class="ma-input-val typing" id="type-note"></div></div>
          
          <div class="ma-btn \${btnClass}" id="btn-pub">PUBLISH AD</div>
        \`;
        
        const amt = document.getElementById('type-amt');
        const note = document.getElementById('type-note');
        const pub = document.getElementById('btn-pub');
        
        // Typing amount
        demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(150px, 120px)'; }, 1000));
        demoTimeouts.push(setTimeout(() => { amt.classList.add('typing'); note.classList.remove('typing'); }, 2000));
        demoTimeouts.push(setTimeout(() => { amt.innerText = "25.08"; amt.classList.remove('typing'); }, 2500));
        
        // Scroll down for Note
        demoTimeouts.push(setTimeout(() => { scrollArea.scrollTop = 250; c.style.transform = 'translate(150px, 350px)'; }, 3500));
        demoTimeouts.push(setTimeout(() => { note.classList.add('typing'); }, 4300));
        demoTimeouts.push(setTimeout(() => { note.innerText = "Erupee only 📍"; note.classList.remove('typing'); }, 4800));
        
        // Click Publish
        demoTimeouts.push(setTimeout(() => { scrollArea.scrollTop = 400; c.style.transform = 'translate(150px, 480px)'; }, 5800));
        
        if (isBuy) {
          demoTimeouts.push(setTimeout(() => { pub.classList.add('btn-clicked'); }, 6800));
          demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 7000));

          // RETURN TO MY ADS (Step 3) - Buy
          demoTimeouts.push(setTimeout(() => {
            scrollArea.innerHTML = \`
              <div class="ma-header"><div class="ma-title">My Ads</div></div>
              <div class="ma-tabs"><div class="ma-tab active">Active (1)</div><div class="ma-tab">History</div></div>
              <div id="ad-list">
                <div class="ad-card">
                  <div class="ad-header">
                    <div class="ad-type"><div class="ad-badge buy">BUY</div> USDC</div>
                    <div class="ad-status">ACTIVE</div>
                  </div>
                  <div class="ad-price">₹98.00 <span>/USDC</span></div>
                  <div class="ad-row"><div class="ad-lbl">Available</div><div class="ad-val">25.08 USDC</div></div>
                  <div class="ad-row"><div class="ad-lbl">Methods</div><div class="ad-method">DIGITAL_RUPEE</div></div>
                  <div class="ad-row"><div class="ad-lbl">Time Left</div><div class="ad-time">⏳ 3h 59m remaining</div></div>
                  <div class="ad-cancel-btn">Cancel Ad</div>
                </div>
              </div>
              <div class="fab" id="btn-fab">+</div>
            \`;
          }, 7500));

          // APP SWITCH to Telegram
          demoTimeouts.push(setTimeout(() => { 
            miniappLayer.style.transform = 'scale(0.95) translateX(-110%)';
            telegramLayer.style.transform = 'translateX(0)';
            
            telegramLayer.innerHTML = \`
              <div class="tg-bg">
                <div class="tg-header">
                  <div class="tg-ava"><img src="favicon.png" alt="P2PFather"/></div>
                  <div><div class="tg-title">P2pFather</div><div class="tg-sub">12,492 members</div></div>
                </div>
                <div class="tg-chat">
                  <div class="tg-msg">
                    <div class="tg-msg-inner">
                      <div class="tg-msg-header"><div class="tg-msg-title">P2pFather</div><div class="tg-msg-bot">P2p Bot</div></div>
                      <div class="tg-msg-text">
                        📢 <b>New BUY Ad!</b><br/><br/>
                        🟢 @Medphysicist wants to buy <b>25.08 USDC</b><br/>
                        💰 Rate: ₹98.00/USDC<br/>
                        🧾 Total: ₹2,458<br/>
                        🔗 Chain: Base<br/>
                        💳 Payment: DIGITAL_RUPEE<br/><br/>
                        📝 Note: Erupee only 📍
                      </div>
                      <div class="tg-msg-time">05:23 PM</div>
                    </div>
                    <div class="tg-inline-btn">⚡ Sell Now ↗</div>
                  </div>
                </div>
              </div>
            \`;
          }, 10500));
          
        } else {
          // Sell Flow (with Rabby deposit overlay)
          demoTimeouts.push(setTimeout(() => { 
            pub.classList.add('btn-clicked'); 
            pub.innerText = "DEPOSITING...";
            pub.style.background = "#2a2d35";
            pub.style.color = "#fff";
          }, 6800));

          demoTimeouts.push(setTimeout(() => { 
            document.getElementById('rw-overlay').style.display = 'flex';
            c.style.transform = 'translate(150px, 450px)';
          }, 7800));

          demoTimeouts.push(setTimeout(() => { 
            document.getElementById('btn-rw-sign').classList.add('btn-clicked'); 
          }, 9300));

          demoTimeouts.push(setTimeout(() => { 
            document.getElementById('rw-overlay').style.display = 'none';
            c.style.opacity = '0';
            const t = document.getElementById('toast');
            t.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Deposit Successful!';
            t.classList.add('show');
            pub.innerText = "PUBLISHED!";
            pub.style.background = "var(--ma-green)";
            pub.style.color = "#000";
          }, 9700));

          demoTimeouts.push(setTimeout(() => { 
            document.getElementById('toast').classList.remove('show');
          }, 11500));

          // RETURN TO MY ADS (Step 3) - Sell
          demoTimeouts.push(setTimeout(() => {
            scrollArea.innerHTML = \`
              <div class="ma-header"><div class="ma-title">My Ads</div></div>
              <div class="ma-tabs"><div class="ma-tab active">Active (1)</div><div class="ma-tab">History</div></div>
              <div id="ad-list">
                <div class="ad-card">
                  <div class="ad-header">
                    <div class="ad-type"><div class="ad-badge sell">SELL</div> USDC</div>
                    <div class="ad-status">ACTIVE</div>
                  </div>
                  <div class="ad-price">₹98.50 <span>/USDC</span></div>
                  <div class="ad-row"><div class="ad-lbl">Available</div><div class="ad-val">25.08 USDC</div></div>
                  <div class="ad-row"><div class="ad-lbl">Methods</div><div class="ad-method">DIGITAL_RUPEE</div></div>
                  <div class="ad-row"><div class="ad-lbl">Time Left</div><div class="ad-time">⏳ 3h 59m remaining</div></div>
                  <div class="ad-cancel-btn">Cancel Ad</div>
                </div>
              </div>
              <div class="fab" id="btn-fab">+</div>
            \`;
          }, 12000));

          // APP SWITCH to Telegram
          demoTimeouts.push(setTimeout(() => { 
            miniappLayer.style.transform = 'scale(0.95) translateX(-110%)';
            telegramLayer.style.transform = 'translateX(0)';
            
            telegramLayer.innerHTML = \`
              <div class="tg-bg">
                <div class="tg-header">
                  <div class="tg-ava"><img src="favicon.png" alt="P2PFather"/></div>
                  <div><div class="tg-title">P2pFather</div><div class="tg-sub">12,492 members</div></div>
                </div>
                <div class="tg-chat">
                  <div class="tg-msg">
                    <div class="tg-msg-inner">
                      <div class="tg-msg-header"><div class="tg-msg-title">P2pFather</div><div class="tg-msg-bot">P2p Bot</div></div>
                      <div class="tg-msg-text">
                        📢 <b>New SELL Ad!</b><br/><br/>
                        🔴 @pcoke_og wants to sell <b>25.08 USDC</b><br/>
                        💰 Rate: ₹98.50/USDC<br/>
                        🧾 Total: ₹2,470<br/>
                        🔗 Chain: Base<br/>
                        💳 Payment: DIGITAL_RUPEE<br/><br/>
                        📝 Note: Erupee only 📍
                      </div>
                      <div class="tg-msg-time">05:24 PM</div>
                    </div>
                    <div class="tg-inline-btn">⚡ Buy Now ↗</div>
                  </div>
                </div>
              </div>
            \`;
          }, 15000));
        }
      }, 3000));
    }, 2800));
    
  } else if (flow === 'vault') {
    miniappLayer.innerHTML = \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content">
        <div class="aw-hero">
          <div class="aw-label">Total Asset Value (Est.)</div>
          <div class="aw-amount" id="total-val">$439.76</div>
          <div class="aw-inr" id="total-inr">≈ ₹38,259</div>
          <div class="aw-actions"><div class="aw-dep">Deposit</div><div class="aw-send">Send</div></div>
        </div>
        <div class="ma-vault-card">
          <div class="ma-bal-lbl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> P2P Escrow Vault</div>
          <div class="ma-bal-val" id="vault-val">0.00 USDT</div>
          <div class="ma-row" style="padding:0; margin-top:1rem; gap:1rem; justify-content:flex-start;">
            <div class="ma-bal-btn" id="btn-topup">+ Top Up</div>
            <div class="ma-btn-outline">Withdraw</div>
          </div>
        </div>
        <div class="aw-assets-hd">My Assets</div>
        <div class="aw-asset-row"><div class="aw-asset-left"><div class="aw-asset-ico" style="background:#627eea;">Ξ</div><div><div class="aw-asset-nm">ETH</div><div class="aw-asset-ch">Base</div></div></div><div><div class="aw-asset-bal">0.00012</div><div class="aw-asset-usd">$0.29</div></div></div>
        <div class="aw-asset-row" style="border:none;"><div class="aw-asset-left"><div class="aw-asset-ico" style="background:#26a17b;">₮</div><div><div class="aw-asset-nm">USDT</div><div class="aw-asset-ch">BSC</div></div></div><div><div class="aw-asset-bal" id="my-usdt">395.71</div><div class="aw-asset-usd" id="my-usd-usdt">$395.71</div></div></div>
      </div>
      \${renderNav('wallet')}
      
      <!-- Top Up Modal -->
      <div class="ma-modal" id="modal" style="display:none; opacity:0;">
        <div class="ma-modal-content">
          <div style="font-size:1.2rem; font-weight:700; color:#fff; margin-bottom:1.5rem;">Top Up Vault</div>
          <div class="ma-label" style="margin:0 0 0.5rem;">SELECT TOKEN</div>
          <div class="ma-row" style="padding:0; margin-bottom:1.5rem;"><div class="ma-chip active" style="flex:1;">USDT</div><div class="ma-chip" style="flex:1;">USDC</div></div>
          <div class="ma-label" style="margin:0 0 0.5rem;">AMOUNT</div>
          <div class="ma-input" style="margin:0;"><div class="ma-input-val typing" id="v-amt"></div><div class="ma-input-suffix">USDT</div></div>
          <div class="ma-btn ma-btn-green" style="margin:2rem 0 0;" id="btn-conf">CONFIRM DEPOSIT</div>
        </div>
      </div>

      <!-- MetaMask Popup Overlay -->
      <div class="mm-overlay" id="mm-overlay" style="display:none;">
        <div class="mm-popup">
          <div class="mm-logo"></div>
          <div class="mm-title">Signature Request</div>
          <div class="mm-sub">P2PFather is requesting a signature to deposit 500 USDT to Escrow.</div>
          <div class="mm-btn" id="btn-mm-sign">Sign & Deposit</div>
        </div>
      </div>
    \`;

    const c = document.getElementById('cursor');
    const topup = document.getElementById('btn-topup');
    const modal = document.getElementById('modal');
    const mmOverlay = document.getElementById('mm-overlay');
    const btnMmSign = document.getElementById('btn-mm-sign');
    const vamt = document.getElementById('v-amt');
    const conf = document.getElementById('btn-conf');
    const vaultVal = document.getElementById('vault-val');
    const toast = document.getElementById('toast');

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(100px, 240px)'; }, 1000));
    demoTimeouts.push(setTimeout(() => { topup.classList.add('btn-clicked'); }, 2500));
    
    demoTimeouts.push(setTimeout(() => { 
      modal.style.display = 'flex';
      modal.style.opacity = '1'; 
      c.style.transform = 'translate(150px, 400px)';
    }, 3000));
    
    demoTimeouts.push(setTimeout(() => { vamt.innerText = "500"; vamt.classList.remove('typing'); }, 4000));
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(150px, 500px)'; }, 4800));
    demoTimeouts.push(setTimeout(() => { conf.classList.add('btn-clicked'); }, 6000));

    demoTimeouts.push(setTimeout(() => { 
      modal.style.display = 'none';
      mmOverlay.style.display = 'flex';
      c.style.transform = 'translate(150px, 420px)';
    }, 6600));

    demoTimeouts.push(setTimeout(() => { btnMmSign.classList.add('btn-clicked'); }, 8300));

    demoTimeouts.push(setTimeout(() => { 
      mmOverlay.style.display = 'none';
      c.style.opacity = '0';
      toast.classList.add('show');
      vaultVal.innerText = "500.00 USDT";
      vaultVal.style.color = "#0ecb81";
    }, 9000));

    demoTimeouts.push(setTimeout(() => { 
      toast.classList.remove('show');
      vaultVal.style.color = "#fff";
    }, 12000));
  }
}

// Start first flow
setTimeout(() => playFlow('buy'), 500);
`;

const cssStart = html.indexOf('<style>\n/* --- DEMO CONTAINER --- */');
const cssEnd = html.indexOf('</style>', cssStart);

if (cssStart !== -1) {
    html = html.substring(0, cssStart) + '<style>\n' + newCSS + '\n' + html.substring(cssEnd);
}

const jsStart = html.indexOf('<script>\n// --- TRUE MINIAPP DEMO ENGINE ---');
const jsEnd = html.indexOf('</script>', jsStart);

if (jsStart !== -1) {
    html = html.substring(0, jsStart) + '<script>\n' + jsScript + '\n' + html.substring(jsEnd);
}

fs.writeFileSync('public/index.html', html);
console.log("App Switcher built.");
