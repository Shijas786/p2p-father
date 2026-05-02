const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// The new perfect CSS
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
.phone-shell {
  background: #0f0f11; border-radius: 40px; padding: 12px;
  box-shadow: inset 0 0 0 2px #3a3a3c, inset 0 0 0 6px #121212;
  position: relative;
}
.phone-screen {
  background: var(--ma-bg); border-radius: 30px; overflow: hidden;
  position: relative; display: flex; flex-direction: column; height: 600px;
}

/* Dynamic Island Notch */
.notch {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  width: 90px; height: 26px; background: #000; border-radius: 20px;
  z-index: 999; box-shadow: 0 0 0 1px rgba(255,255,255,0.05);
}

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

.ma-content { flex: 1; overflow-y: auto; padding: 34px 0 60px 0; /* padding top for notch */ }

/* Nav Bar */
.ma-nav {
  height: 60px; background: rgba(30,30,30,0.95); backdrop-filter: blur(10px); border-top: 1px solid var(--ma-border);
  display: flex; justify-content: space-around; align-items: center; position: absolute; bottom: 0; width: 100%; z-index: 10;
}
.ma-nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--ma-sub); font-size: 0.55rem; font-weight: 500; }
.ma-nav-item.active { color: var(--ma-text); }
.ma-nav-item svg { width: 22px; height: 22px; fill: var(--ma-sub); }
.ma-nav-item.active svg { fill: var(--ma-text); }

/* Header */
.ma-header { padding: 0.5rem 1rem 1rem; border-bottom: 1px solid var(--ma-border); }
.ma-title { font-size: 1.2rem; font-weight: 700; color: var(--ma-text); font-family: 'DM Sans', sans-serif;}

/* Ads Screen specific */
.ma-toggle-group { display: flex; gap: 0.5rem; padding: 1rem; }
.ma-toggle { flex: 1; padding: 0.7rem; text-align: center; border-radius: 10px; font-weight: 700; font-size: 0.85rem; background: var(--ma-surface); color: var(--ma-sub); border: 1px solid var(--ma-border); transition: all 0.2s; }
.ma-toggle.buy-active { background: rgba(76, 175, 80, 0.15); color: var(--ma-green); border-color: var(--ma-green); }
.ma-toggle.sell-active { background: rgba(255, 77, 77, 0.15); color: var(--ma-red); border-color: var(--ma-red); }

.ma-label { font-size: 0.65rem; color: var(--ma-sub); text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; margin: 1rem 1rem 0.5rem; }
.ma-row { display: flex; gap: 0.5rem; padding: 0 1rem; }
.ma-chip { padding: 0.6rem 1.2rem; border-radius: 100px; border: 1px solid var(--ma-border); color: var(--ma-text); font-size: 0.8rem; font-weight: 600; background: var(--ma-surface); }
.ma-chip.active { border-color: var(--ma-text); background: rgba(255,255,255,0.1); }

.ma-input { margin: 0 1rem; background: var(--ma-surface); border: 1px solid var(--ma-border); border-radius: 12px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; }
.ma-input-val { color: var(--ma-text); font-size: 1rem; font-weight: 600; }
.ma-input-val.typing::after { content: '|'; animation: blink 1s infinite; }
.ma-input-suffix { color: var(--ma-sub); font-size: 0.8rem; font-weight: 700; }

.ma-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 0 1rem; }
.ma-method { padding: 0.8rem; border: 1px solid var(--ma-border); border-radius: 10px; text-align: center; font-weight: 600; font-size: 0.75rem; color: var(--ma-text); background: var(--ma-surface); }
.ma-method.active { border-color: var(--ma-green); background: rgba(76, 175, 80, 0.1); }

.ma-btn { margin: 2rem 1rem; padding: 1rem; border-radius: 14px; font-weight: 700; font-size: 0.95rem; text-align: center; transition: transform 0.1s; }
.ma-btn-green { background: var(--ma-green); color: #fff; }
.ma-btn-red { background: var(--ma-red); color: #fff; }

/* Wallet Screen */
.aw-hero { padding: 0 1rem; margin-bottom: 1rem; }
.aw-label { font-size: 0.65rem; color: var(--ma-sub); text-transform: uppercase; font-weight: 600;}
.aw-amount { font-size: 2rem; font-weight: 700; color: #fff; margin: 0.2rem 0; }
.aw-inr { font-size: 0.7rem; color: var(--ma-sub); }
.aw-actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
.aw-dep { background: rgba(255,255,255,0.1); color: #fff; border-radius: 10px; padding: 0.6rem 1rem; font-size: 0.8rem; font-weight: 600; flex:1; text-align:center;}
.aw-send { background: var(--ma-text); color: #000; border-radius: 10px; padding: 0.6rem 1rem; font-size: 0.8rem; font-weight: 700; flex:1; text-align:center;}

.ma-vault-card { margin: 0 1rem; padding: 1rem; border-radius: 14px; background: var(--ma-surface); border: 1px solid var(--ma-border); }
.ma-bal-lbl { font-size: 0.7rem; color: #fff; font-weight: 600; display:flex; align-items:center; gap:0.4rem; }
.ma-bal-val { font-size: 1.4rem; font-weight: 700; color: var(--ma-text); margin: 0.5rem 0; }
.ma-bal-btn { background: var(--ma-green); color: #fff; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.75rem; font-weight: 700; display: inline-block;}
.ma-btn-outline { border: 1px solid var(--ma-border); color: var(--ma-text); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.75rem; font-weight: 600; }

.aw-assets-hd { font-size: 0.8rem; font-weight: 700; color: #fff; padding: 1.5rem 1rem 0.5rem; }
.aw-asset-row { display: flex; justify-content: space-between; align-items: center; padding: 0.8rem 1rem; border-bottom: 1px solid var(--ma-border); }
.aw-asset-left { display: flex; align-items: center; gap: 0.6rem; }
.aw-asset-ico { width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; color: #fff; }
.aw-asset-nm { font-size: 0.8rem; font-weight: 600; color: #fff; }
.aw-asset-ch { font-size: 0.6rem; color: var(--ma-sub); }
.aw-asset-bal { font-size: 0.8rem; font-weight: 700; color: #fff; text-align: right; }
.aw-asset-usd { font-size: 0.6rem; color: var(--ma-sub); text-align: right; }

.ma-modal { position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 100; display: flex; flex-direction: column; justify-content: flex-end; opacity: 0; animation: fadeOverlay 0.3s forwards; }
.ma-modal-content { background: var(--ma-surface); border-radius: 24px 24px 0 0; padding: 2rem 1rem; transform: translateY(100%); animation: slidePopup 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

/* Telegram Screen */
.tg-bg { background: #0e1621; position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; opacity:0; animation: fadeOverlay 0.3s forwards;}
.tg-header { background: #17212b; padding: 40px 1rem 1rem; display: flex; align-items: center; gap: 0.8rem; }
.tg-ava { width: 40px; height: 40px; border-radius: 50%; background: #2b5278; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold;}
.tg-title { color: #fff; font-weight: 600; font-size: 1rem; }
.tg-sub { color: #7f91a4; font-size: 0.7rem; }
.tg-chat { flex: 1; padding: 1rem; background: url('https://web.telegram.org/a/chat-bg-pattern-dark.png') center/cover; }
.tg-msg { background: #182533; border-radius: 12px 12px 12px 0; padding: 0.8rem; width: 85%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.95); transform-origin: left bottom; animation: popMsg 0.4s 0.3s forwards cubic-bezier(0.17, 0.89, 0.32, 1.28); }
.tg-msg-title { color: #3895d3; font-weight: 700; font-size: 0.8rem; margin-bottom: 0.4rem; }
.tg-msg-text { color: #fff; font-size: 0.8rem; line-height: 1.5; }
.tg-msg-btn { background: #2b5278; color: #fff; border-radius: 8px; padding: 0.6rem; text-align: center; font-size: 0.8rem; font-weight: 600; margin-top: 0.8rem; }

/* Cursors */
.demo-cursor { position: absolute; width: 24px; height: 24px; z-index: 200; pointer-events: none; background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.24c.45 0 .67-.54.35-.85L6.35 3.56a.5.5 0 0 0-.85.35Z" fill="white" stroke="%231a1108" stroke-width="1.5"/></svg>'); background-size: contain; opacity: 0; transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s; }
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
  p2p: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>',
  orders: '<svg viewBox="0 0 24 24"><path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.41l9 9c.36.36.86.59 1.41.59s1.05-.22 1.41-.59l7-7c.36-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>',
  wallet: '<svg viewBox="0 0 24 24"><path d="M21 7.28V5c0-1.1-.9-2-2-2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-2.28c.59-.35 1-.98 1-1.72V9c0-.74-.41-1.37-1-1.72zM20 9v6h-4V9h4zM5 19V5h14v2h-4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4v2H5z"/></svg>',
  profile: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
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

  const screen = document.getElementById('master-screen');
  const notch = '<div class="notch"></div>';
  
  if (flow === 'buy' || flow === 'sell') {
    const isBuy = flow === 'buy';
    const colorClass = isBuy ? 'buy-active' : 'sell-active';
    const btnClass = isBuy ? 'ma-btn-green' : 'ma-btn-red';
    const activeText = isBuy ? 'BUY' : 'SELL';
    
    // Screen 1: Trade Setup
    screen.innerHTML = notch + \`
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

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(150px, 350px)'; }, 500));
    demoTimeouts.push(setTimeout(() => { nxt.classList.add('btn-clicked'); }, 1200));
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 1300));
    
    // Screen 2: Form Details
    demoTimeouts.push(setTimeout(() => {
      screen.innerHTML = notch + \`
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
            <div class="ma-method">Bank Transfer</div><div class="ma-method">Cash</div>
          </div>
          
          <div class="ma-btn \${btnClass}" id="btn-pub">PUBLISH AD</div>
        </div>
        \${renderNav('ads')}
        <div id="tg-overlay"></div>
      \`;
      
      const c2 = document.getElementById('cursor');
      const amt = document.getElementById('type-amt');
      const pub = document.getElementById('btn-pub');
      const tgOverlay = document.getElementById('tg-overlay');
      
      demoTimeouts.push(setTimeout(() => { c2.style.opacity = '1'; c2.style.transform = 'translate(150px, 120px)'; }, 500));
      demoTimeouts.push(setTimeout(() => { amt.classList.add('typing'); }, 1100));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "1"; }, 1500));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "10"; }, 1700));
      demoTimeouts.push(setTimeout(() => { amt.innerText = "100"; amt.classList.remove('typing'); }, 1900));
      demoTimeouts.push(setTimeout(() => { c2.style.transform = 'translate(150px, 500px)'; }, 2400));
      demoTimeouts.push(setTimeout(() => { pub.classList.add('btn-clicked'); }, 3100));
      demoTimeouts.push(setTimeout(() => { c2.style.opacity = '0'; }, 3200));

      // Screen 3: Telegram Broadcast
      demoTimeouts.push(setTimeout(() => { 
        tgOverlay.innerHTML = \`
          <div class="tg-bg">
            <div class="tg-header">
              <div class="tg-ava">P2P</div>
              <div><div class="tg-title">Kerala P2P Market</div><div class="tg-sub">12,492 members</div></div>
            </div>
            <div class="tg-chat">
              <div class="tg-msg">
                <div class="tg-msg-title">P2PFather Bot</div>
                <div class="tg-msg-text">
                  📢 <b>New Ad Created!</b><br/><br/>
                  <b>Type:</b> \${isBuy ? '🟢 BUY' : '🔴 SELL'} USDC<br/>
                  <b>Amount:</b> 100 USDC<br/>
                  <b>Price:</b> ₹89.20<br/>
                  <b>Creator:</b> @CryptoTrader<br/><br/>
                  <i>Escrow locked securely on Base.</i>
                </div>
                <div class="tg-msg-btn">Trade Now</div>
              </div>
            </div>
          </div>
        \`;
      }, 3600));

    }, 1500));
    
  } else if (flow === 'vault') {
    screen.innerHTML = notch + \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content">
        <div class="aw-hero">
          <div class="aw-label">Total Asset Value (Est.)</div>
          <div class="aw-amount">$439.76</div>
          <div class="aw-inr">≈ ₹38,259</div>
          <div class="aw-actions"><div class="aw-dep">Deposit</div><div class="aw-send">Send</div></div>
        </div>
        <div class="ma-vault-card">
          <div class="ma-bal-lbl"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> P2P Escrow Vault</div>
          <div class="ma-bal-val">0.00 USDC</div>
          <div class="ma-row" style="padding:0; margin-top:1rem; gap:1rem; justify-content:flex-start;">
            <div class="ma-bal-btn" id="btn-topup">+ Top Up</div>
            <div class="ma-btn-outline">Withdraw</div>
          </div>
        </div>
        <div class="aw-assets-hd">My Assets</div>
        <div class="aw-asset-row"><div class="aw-asset-left"><div class="aw-asset-ico" style="background:#627eea;">Ξ</div><div><div class="aw-asset-nm">ETH</div><div class="aw-asset-ch">Base</div></div></div><div><div class="aw-asset-bal">0.00012</div><div class="aw-asset-usd">$0.29</div></div></div>
        <div class="aw-asset-row"><div class="aw-asset-left"><div class="aw-asset-ico" style="background:#2775ca;">$</div><div><div class="aw-asset-nm">USDC</div><div class="aw-asset-ch">Base</div></div></div><div><div class="aw-asset-bal">33.00</div><div class="aw-asset-usd">$33.00</div></div></div>
        <div class="aw-asset-row" style="border:none;"><div class="aw-asset-left"><div class="aw-asset-ico" style="background:#26a17b;">₮</div><div><div class="aw-asset-nm">USDT</div><div class="aw-asset-ch">BSC</div></div></div><div><div class="aw-asset-bal">395.71</div><div class="aw-asset-usd">$395.71</div></div></div>
      </div>
      \${renderNav('wallet')}
      <div class="ma-modal" id="modal" style="display:none; opacity:0;">
        <div class="ma-modal-content">
          <div style="font-size:1.2rem; font-weight:700; color:#fff; margin-bottom:1.5rem;">Top Up Vault</div>
          <div class="ma-label" style="margin:0 0 0.5rem;">SELECT CHAIN</div>
          <div class="ma-row" style="padding:0; margin-bottom:1.5rem;"><div class="ma-chip active">Base</div><div class="ma-chip">BSC</div></div>
          <div class="ma-label" style="margin:0 0 0.5rem;">AMOUNT</div>
          <div class="ma-input" style="margin:0;"><div class="ma-input-val typing" id="v-amt"></div><div class="ma-input-suffix">USDC</div></div>
          <div class="ma-btn ma-btn-green" style="margin:2rem 0 0;" id="btn-conf">CONFIRM DEPOSIT</div>
        </div>
      </div>
    \`;

    const c = document.getElementById('cursor');
    const topup = document.getElementById('btn-topup');
    const modal = document.getElementById('modal');

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(100px, 240px)'; }, 500));
    demoTimeouts.push(setTimeout(() => { topup.classList.add('btn-clicked'); }, 1200));
    
    demoTimeouts.push(setTimeout(() => { 
      modal.style.display = 'flex';
      modal.style.opacity = '1'; 
      c.style.transform = 'translate(150px, 400px)';
    }, 1400));

    const vamt = document.getElementById('v-amt');
    const conf = document.getElementById('btn-conf');

    demoTimeouts.push(setTimeout(() => { vamt.innerText = "5"; }, 2300));
    demoTimeouts.push(setTimeout(() => { vamt.innerText = "50"; }, 2500));
    demoTimeouts.push(setTimeout(() => { vamt.innerText = "500"; vamt.classList.remove('typing'); }, 2700));
    
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(150px, 500px)'; }, 3200));
    demoTimeouts.push(setTimeout(() => { conf.classList.add('btn-clicked'); }, 3900));
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '0'; }, 4000));
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
console.log("Perfect Exact Copy Cat Demo Built.");
