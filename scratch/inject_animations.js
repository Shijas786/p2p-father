const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

const customCSS = `
/* --- LIVE DEMO ANIMATIONS --- */
.fake-cursor {
  position: absolute;
  width: 20px;
  height: 20px;
  background-image: url('data:image/svg+xml;utf8,<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.24c.45 0 .67-.54.35-.85L6.35 3.56a.5.5 0 0 0-.85.35Z" fill="white" stroke="%231a1108" stroke-width="1.5"/></svg>');
  background-size: contain;
  pointer-events: none;
  z-index: 100;
  opacity: 0;
  transform: translate(150px, 200px);
}

/* Wallet Top-Up Animation */
.app-wallet .fake-cursor {
  animation: cursorTopUp 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes cursorTopUp {
  0% { opacity: 0; transform: translate(150px, 250px); }
  10% { opacity: 1; transform: translate(150px, 250px); }
  25% { transform: translate(185px, 160px); /* Move to Top Up btn */ }
  30% { transform: translate(185px, 160px) scale(0.9); /* Click */ }
  35% { transform: translate(185px, 160px) scale(1); }
  50% { opacity: 0; transform: translate(185px, 160px); }
  100% { opacity: 0; }
}

.aw-topup { transition: all 0.1s; }
.aw-topup.click-anim {
  animation: btnClick 6s infinite;
}

@keyframes btnClick {
  0%, 28% { transform: scale(1); filter: brightness(1); }
  30% { transform: scale(0.92); filter: brightness(1.2); }
  35%, 100% { transform: scale(1); filter: brightness(1); }
}

.animated-bal::after {
  content: "7.29";
  animation: balanceUpdate 6s infinite;
}

@keyframes balanceUpdate {
  0%, 35% { content: "7.29"; color: #fff; }
  36%, 40% { content: "107.29"; color: #0ecb81; }
  45%, 100% { content: "107.29"; color: #fff; }
}

/* Create Ad Animation */
.app-ad .fake-cursor {
  animation: cursorAd 8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes cursorAd {
  0% { opacity: 0; transform: translate(100px, 300px); }
  5% { opacity: 1; transform: translate(100px, 300px); }
  15% { transform: translate(200px, 100px); /* Move to BUY toggle */ }
  18% { transform: translate(200px, 100px) scale(0.9); /* Click BUY */ }
  22% { transform: translate(200px, 100px) scale(1); }
  35% { transform: translate(200px, 150px); /* Move to BSC */ }
  38% { transform: translate(200px, 150px) scale(0.9); /* Click BSC */ }
  42% { transform: translate(200px, 150px) scale(1); }
  60% { transform: translate(140px, 260px); /* Move to Next Step */ }
  63% { transform: translate(140px, 260px) scale(0.9); /* Click Next */ }
  67% { transform: translate(140px, 260px) scale(1); }
  80% { opacity: 0; transform: translate(140px, 260px); }
  100% { opacity: 0; }
}

.toggle-buy-anim { animation: toggleBuy 8s infinite; }
@keyframes toggleBuy {
  0%, 17% { background: rgba(255,255,255,.06); color: rgba(255,255,255,.5); border-color: rgba(255,255,255,.08); }
  18%, 100% { background: rgba(14,203,129,.12); color: #0ecb81; border-color: #0ecb81; }
}

.toggle-sell-anim { animation: toggleSell 8s infinite; }
@keyframes toggleSell {
  0%, 17% { background: rgba(246,70,93,.18); border-color: #f6465d; }
  18%, 100% { background: rgba(246,70,93,.12); color: #f6465d; border-color: rgba(246,70,93,.3); }
}

.toggle-bsc-anim { animation: toggleBSC 8s infinite; }
@keyframes toggleBSC {
  0%, 37% { background: rgba(255,255,255,.06); color: rgba(255,255,255,.4); border-color: rgba(255,255,255,.08); }
  38%, 100% { background: rgba(255,255,255,.1); color: #fff; border-color: #fff; }
}
.toggle-base-anim { animation: toggleBase 8s infinite; }
@keyframes toggleBase {
  0%, 37% { background: rgba(255,255,255,.1); color: #fff; border-color: #fff; }
  38%, 100% { background: rgba(255,255,255,.06); color: rgba(255,255,255,.4); border-color: rgba(255,255,255,.08); }
}

.aa-cta-anim { animation: ctaClick 8s infinite; }
@keyframes ctaClick {
  0%, 62% { transform: scale(1); filter: brightness(1); }
  63% { transform: scale(0.95); filter: brightness(1.2); }
  68%, 100% { transform: scale(1); filter: brightness(1); }
}
</style>
`;
html = html.replace('</style>', customCSS);

// Inject elements into Wallet screen
html = html.replace('<div class="aw-topup">+ Top Up</div>', '<div class="aw-topup click-anim">+ Top Up</div>');
html = html.replace('<div class="aw-tok-val">7.29</div>', '<div class="aw-tok-val animated-bal"></div>');
html = html.replace('<div class="app-frame">', '<div class="app-frame">\n          <div class="fake-cursor"></div>'); 
// this will match the first one (Wallet)

// Inject elements into Create Ad screen
html = html.replace('<div class="app-frame">', '<div class="app-frame">\n          <div class="fake-cursor"></div>'); 
// wait, replace only replaces the first instance. Let's make it more robust.

let adFrameStart = html.indexOf('<div class="aa-header">');
let firstHalf = html.substring(0, adFrameStart);
let secondHalf = html.substring(adFrameStart);

// find the exact app-frame before aa-header
let lastAppFrameIdx = firstHalf.lastIndexOf('<div class="app-frame">');
firstHalf = firstHalf.substring(0, lastAppFrameIdx) + '<div class="app-frame">\n          <div class="fake-cursor"></div>' + firstHalf.substring(lastAppFrameIdx + '<div class="app-frame">'.length);

html = firstHalf + secondHalf;

html = html.replace('<div class="aa-opt aa-opt-sell active">🔴 SELL</div>', '<div class="aa-opt aa-opt-sell toggle-sell-anim">🔴 SELL</div>');
html = html.replace('<div class="aa-opt aa-opt-buy">🟢 BUY</div>', '<div class="aa-opt aa-opt-buy toggle-buy-anim">🟢 BUY</div>');
html = html.replace('<div class="aa-opt" style="background:rgba(255,255,255,.1);color:#fff;border:1.5px solid #fff;">Base</div>', '<div class="aa-opt toggle-base-anim">Base</div>');
html = html.replace('<div class="aa-opt" style="background:rgba(255,255,255,.06);color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.08);">BSC</div>', '<div class="aa-opt toggle-bsc-anim">BSC</div>');
html = html.replace('<div class="aa-cta">Next Step ➡</div>', '<div class="aa-cta aa-cta-anim">Next Step ➡</div>');

fs.writeFileSync('public/index.html', html);
console.log("Animations injected.");
