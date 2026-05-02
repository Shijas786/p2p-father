const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// 1. Remove floating phone from Hero
const heroPhoneStart = html.indexOf('<!-- Floating phone mockup (Wallet screen) -->');
if (heroPhoneStart !== -1) {
    const heroPhoneEnd = html.indexOf('</section>', heroPhoneStart);
    html = html.substring(0, heroPhoneStart) + html.substring(heroPhoneEnd);
}

// 2. Rewrite Mini App section
const miniAppStart = html.indexOf('<!-- MINI APP SECTION -->');
const tokensStart = html.indexOf('<!-- TOKENS -->');

const newMiniAppSection = `<!-- MINI APP SECTION -->
<section class="section-wide" id="miniapp">
  <div class="eyebrow r">Interactive Demo</div>
  <h2 class="miniapp-h r d1">See how easy it is to<br/>create a <em>secure ad</em></h2>
  <p class="miniapp-body r d2" style="max-width:500px;">
    Everything from escrow locking to Telegram broadcasting happens automatically. 
    Click through the timeline to see the flow in action.
  </p>

  <div class="demo-container r d3">
    <div class="demo-menu">
      <div class="demo-step active" onclick="playStep(1)">
        <div class="step-num">1</div>
        <div class="step-text">
          <div class="step-title">Configure Ad</div>
          <div class="step-desc">Set amount, price, and time limits</div>
        </div>
      </div>
      <div class="demo-step" onclick="playStep(2)">
        <div class="step-num">2</div>
        <div class="step-text">
          <div class="step-title">Sign & Escrow Lock</div>
          <div class="step-text">Confirm transaction in your Web3 wallet</div>
        </div>
      </div>
      <div class="demo-step" onclick="playStep(3)">
        <div class="step-num">3</div>
        <div class="step-text">
          <div class="step-title">Listed on Marketplace</div>
          <div class="step-desc">Your ad is now live in the Mini App</div>
        </div>
      </div>
      <div class="demo-step" onclick="playStep(4)">
        <div class="step-num">4</div>
        <div class="step-text">
          <div class="step-title">Telegram Broadcast</div>
          <div class="step-desc">Instant notification to local P2P groups</div>
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
    html = html.substring(0, miniAppStart) + newMiniAppSection + html.substring(tokensStart);
}

// 3. Inject CSS and JS for the demo
const demoCSS = `
/* --- DEMO CONTAINER --- */
.demo-container {
  display: flex;
  gap: 4rem;
  margin-top: 3rem;
  align-items: center;
}
.demo-menu {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.demo-step {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 16px;
  background: var(--paper);
  border: 1px solid var(--rule);
  cursor: pointer;
  transition: all 0.3s;
}
.demo-step:hover {
  background: var(--paper2);
}
.demo-step.active {
  background: #1e2026;
  border-color: #0ecb81;
  transform: translateX(10px);
}
.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--rule);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Space Mono', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  flex-shrink: 0;
}
.demo-step.active .step-num {
  background: #0ecb81;
  color: #fff;
}
.step-title {
  font-family: 'DM Sans', sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 0.2rem;
}
.demo-step.active .step-title { color: #fff; }
.step-desc {
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.5;
}
.demo-step.active .step-desc { color: rgba(255,255,255,0.6); }

.demo-phone {
  width: 280px;
  flex-shrink: 0;
  filter: drop-shadow(0 24px 48px rgba(26,17,8,.15));
}

/* --- DEMO SCREENS CSS --- */
/* Form inputs */
.aa-input-group { margin: 0.8rem 1rem; }
.aa-input-lbl { font-family: 'Space Mono', monospace; font-size: 0.45rem; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 0.3rem; }
.aa-input-box { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.6rem; display: flex; justify-content: space-between; align-items: center; }
.aa-input-val { color: #fff; font-size: 0.75rem; font-family: 'Space Mono', monospace; }
.aa-input-val.typing::after { content: '|'; animation: blink 1s infinite; }
.aa-input-suffix { color: rgba(255,255,255,0.3); font-size: 0.6rem; font-weight: 600; }

@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

/* Wallet Overlay */
.wallet-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; flex-direction: column; justify-content: flex-end;
  opacity: 0; animation: fadeOverlay 0.4s forwards; z-index: 50;
}
.wallet-popup {
  background: #1e2026; border-radius: 20px 20px 0 0; padding: 1.2rem;
  transform: translateY(100%); animation: slidePopup 0.5s 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.wp-header { display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 0.8rem; margin-bottom: 0.8rem; }
.wp-icon { width: 24px; height: 24px; background: #3b82f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 0.6rem;}
.wp-title { color: #fff; font-weight: 600; font-size: 0.85rem; }
.wp-row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.7rem; }
.wp-lbl { color: rgba(255,255,255,0.5); }
.wp-val { color: #fff; font-family: 'Space Mono', monospace;}
.wp-btn { background: #0ecb81; color: #fff; padding: 0.6rem; text-align: center; border-radius: 10px; font-weight: 600; font-size: 0.75rem; margin-top: 1rem; transition: transform 0.1s;}
.wp-btn.clicked { transform: scale(0.95); opacity: 0.8; }
.wp-loader { display: none; margin: 2rem auto; width: 24px; height: 24px; border: 2px solid rgba(14,203,129,0.3); border-top-color: #0ecb81; border-radius: 50%; animation: spin 1s infinite linear;}
@keyframes fadeOverlay { to { opacity: 1; } }
@keyframes slidePopup { to { transform: translateY(0); } }
@keyframes spin { to { transform: rotate(360deg); } }

/* My Ads Screen */
.ad-card {
  background: #1e2026; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 1rem; margin: 1rem; opacity: 0; animation: fadeup 0.5s forwards;
}
.ad-card-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
.ad-type { color: #f6465d; font-weight: 700; font-size: 0.7rem; display: flex; align-items: center; gap: 0.3rem;}
.ad-badge { background: rgba(14,203,129,0.15); color: #0ecb81; padding: 0.2rem 0.5rem; border-radius: 100px; font-size: 0.5rem; font-weight: bold; font-family: 'Space Mono', monospace; }
.ad-price { font-size: 1.1rem; color: #fff; font-weight: bold; }
.ad-limits { font-size: 0.6rem; color: rgba(255,255,255,0.4); margin-top: 0.3rem; }

/* Telegram Screen */
.tg-bg { background: #0e1621; height: 100%; display: flex; flex-direction: column; }
.tg-header { background: #17212b; padding: 1rem 0.8rem; display: flex; align-items: center; gap: 0.6rem; }
.tg-ava { width: 32px; height: 32px; border-radius: 50%; background: #2b5278; display:flex; align-items:center; justify-content:center; color:#fff; font-size: 0.8rem;}
.tg-title { color: #fff; font-weight: 600; font-size: 0.8rem; }
.tg-sub { color: #7f91a4; font-size: 0.55rem; }
.tg-chat { flex: 1; padding: 1rem; background: url('https://web.telegram.org/a/chat-bg-pattern-dark.png') center/cover; }
.tg-msg {
  background: #182533; border-radius: 12px 12px 12px 0; padding: 0.7rem; width: 85%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.95); transform-origin: left bottom;
  animation: popMsg 0.4s 0.3s forwards cubic-bezier(0.17, 0.89, 0.32, 1.28);
}
.tg-msg-title { color: #3895d3; font-weight: 700; font-size: 0.7rem; margin-bottom: 0.4rem; }
.tg-msg-text { color: #fff; font-size: 0.65rem; line-height: 1.5; font-family: 'Space Mono', monospace; }
.tg-msg-btn { background: #2b5278; color: #fff; border-radius: 6px; padding: 0.4rem; text-align: center; font-size: 0.65rem; font-weight: 600; margin-top: 0.6rem; }

@keyframes popMsg { to { opacity: 1; transform: scale(1); } }

/* Shared Cursor */
.demo-cursor {
  position: absolute; width: 22px; height: 22px; z-index: 100; pointer-events: none;
  background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.24c.45 0 .67-.54.35-.85L6.35 3.56a.5.5 0 0 0-.85.35Z" fill="white" stroke="%231a1108" stroke-width="1.5"/></svg>');
  background-size: contain; opacity: 0; transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s;
}

@media(max-width:900px){
  .demo-container { flex-direction: column; }
  .demo-phone { margin: 0 auto; }
}
</style>

<script>
// --- INTERACTIVE DEMO ENGINE ---
let demoTimeouts = [];

function clearDemo() {
  demoTimeouts.forEach(clearTimeout);
  demoTimeouts = [];
}

function updateMenu(stepIndex) {
  document.querySelectorAll('.demo-step').forEach((el, idx) => {
    if (idx + 1 === stepIndex) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function playStep(step) {
  clearDemo();
  updateMenu(step);
  const screen = document.getElementById('master-screen');
  
  if (step === 1) {
    screen.innerHTML = \`
      <div class="demo-cursor" id="c1" style="transform: translate(140px, 350px);"></div>
      <div class="frame-bar">
        <div class="frame-dot" style="background:#ff5f56;"></div><div class="frame-dot" style="background:#ffbd2e;"></div><div class="frame-dot" style="background:#27c93f;"></div>
      </div>
      <div class="aa-header"><div class="aa-title">Create Ad</div><div class="aa-sub">List your order on the marketplace</div></div>
      <div class="aa-section">
        <div class="aa-section-lbl">1. Trade Type</div>
        <div class="aa-toggle">
          <div class="aa-opt aa-opt-sell" id="btn-sell">🔴 SELL</div>
          <div class="aa-opt aa-opt-buy" style="background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);border:1px solid rgba(255,255,255,.08);">🟢 BUY</div>
        </div>
      </div>
      <div class="aa-input-group">
        <div class="aa-input-lbl">Amount to Sell</div>
        <div class="aa-input-box"><div class="aa-input-val" id="type-amt"></div><div class="aa-input-suffix">USDT</div></div>
      </div>
      <div class="aa-input-group">
        <div class="aa-input-lbl">Price (INR)</div>
        <div class="aa-input-box"><div class="aa-input-val">89.20</div><div class="aa-input-suffix">₹</div></div>
      </div>
      <div class="aa-cta" id="btn-next">Create Ad ➡</div>
    \`;

    const c = document.getElementById('c1');
    const amt = document.getElementById('type-amt');
    const sellBtn = document.getElementById('btn-sell');

    // Sequence
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(70px, 140px)'; }, 400));
    demoTimeouts.push(setTimeout(() => { 
      c.style.transform = 'translate(70px, 140px) scale(0.9)'; 
      sellBtn.style.background = 'rgba(246,70,93,.12)';
      sellBtn.style.color = '#f6465d';
      sellBtn.style.borderColor = 'rgba(246,70,93,.3)';
    }, 1100));
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(140px, 210px)'; amt.classList.add('typing'); }, 1500));
    demoTimeouts.push(setTimeout(() => { amt.innerText = "1"; }, 2000));
    demoTimeouts.push(setTimeout(() => { amt.innerText = "10"; }, 2200));
    demoTimeouts.push(setTimeout(() => { amt.innerText = "100"; amt.classList.remove('typing'); }, 2400));
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(140px, 350px)'; }, 3000));
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(140px, 350px) scale(0.9)'; document.getElementById('btn-next').style.transform = 'scale(0.95)'; }, 3700));
    demoTimeouts.push(setTimeout(() => { document.getElementById('btn-next').style.transform = 'scale(1)'; c.style.opacity = '0'; }, 3900));
    demoTimeouts.push(setTimeout(() => { playStep(2); }, 4400));

  } else if (step === 2) {
    // Wallet Popup
    screen.innerHTML = \`
      <div class="demo-cursor" id="c2" style="transform: translate(140px, 200px); opacity:0;"></div>
      <div class="frame-bar"><div class="frame-dot" style="background:#ff5f56;"></div><div class="frame-dot" style="background:#ffbd2e;"></div><div class="frame-dot" style="background:#27c93f;"></div></div>
      <div style="padding: 1rem; filter: blur(3px); opacity: 0.5;">
        <div class="aa-header"><div class="aa-title">Processing...</div></div>
        <div class="aa-input-box" style="margin-top:2rem; height:150px;"></div>
      </div>
      <div class="wallet-overlay">
        <div class="wallet-popup" id="wp">
          <div class="wp-header"><div class="wp-icon">W</div><div class="wp-title">Sign Transaction</div></div>
          <div class="wp-row"><div class="wp-lbl">Action</div><div class="wp-val">Lock Escrow</div></div>
          <div class="wp-row"><div class="wp-lbl">Amount</div><div class="wp-val">100 USDT</div></div>
          <div class="wp-row"><div class="wp-lbl">Network</div><div class="wp-val">BSC Mainnet</div></div>
          <div class="wp-btn" id="btn-sign">Sign & Lock</div>
          <div class="wp-loader" id="loader"></div>
        </div>
      </div>
    \`;
    const c = document.getElementById('c2');
    const signBtn = document.getElementById('btn-sign');
    const loader = document.getElementById('loader');

    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(140px, 380px)'; }, 800));
    demoTimeouts.push(setTimeout(() => { c.style.transform = 'translate(140px, 380px) scale(0.9)'; signBtn.classList.add('clicked'); }, 1500));
    demoTimeouts.push(setTimeout(() => { 
      c.style.transform = 'translate(140px, 380px) scale(1)'; 
      signBtn.style.display = 'none';
      loader.style.display = 'block';
      c.style.opacity = '0';
    }, 1700));
    demoTimeouts.push(setTimeout(() => { playStep(3); }, 3500));

  } else if (step === 3) {
    // My Ads
    screen.innerHTML = \`
      <div class="frame-bar"><div class="frame-dot" style="background:#ff5f56;"></div><div class="frame-dot" style="background:#ffbd2e;"></div><div class="frame-dot" style="background:#27c93f;"></div></div>
      <div class="aa-header" style="border-bottom:1px solid rgba(255,255,255,0.06);"><div class="aa-title">My Ads</div></div>
      <div class="ad-card">
        <div class="ad-card-hd">
          <div class="ad-type">🔴 SELL USDT</div>
          <div class="ad-badge">ACTIVE</div>
        </div>
        <div class="ad-price">₹ 89.20</div>
        <div class="ad-limits">Amount: 100 USDT · BSC</div>
      </div>
      <div style="text-align:center; padding: 2rem; color: rgba(255,255,255,0.4); font-size: 0.7rem;">Your ad is live and visible to buyers.</div>
    \`;
    demoTimeouts.push(setTimeout(() => { playStep(4); }, 3000));

  } else if (step === 4) {
    // Telegram
    screen.innerHTML = \`
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
              <b>Type:</b> 🔴 SELL USDT<br/>
              <b>Amount:</b> 100 USDT<br/>
              <b>Price:</b> ₹89.20<br/>
              <b>Seller:</b> @Cryptowolf07<br/><br/>
              <i>Escrow locked securely on BSC.</i>
            </div>
            <div class="tg-msg-btn">Trade Now</div>
          </div>
        </div>
      </div>
    \`;
  }
}

// Start demo automatically
setTimeout(() => playStep(1), 500);
</script>
`;

html = html.replace('</style>', demoCSS + '</style>');

fs.writeFileSync('public/index.html', html);
console.log("Interactive demo built.");
