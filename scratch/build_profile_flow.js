const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Inject the new Profile demo step into the menu
if (!html.includes("playFlow('profile')")) {
  html = html.replace(/<div class="demo-step" onclick="playFlow\('vault'\)">[\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/div>/, match => {
    return match + `
          <div class="demo-step" onclick="playFlow('profile')">
            <div class="step-num">04</div>
            <div>
              <div class="step-title">Setup Profile</div>
              <div class="step-desc">Add bio, payment methods & wallet</div>
            </div>
          </div>`;
  });
}

// Ensure the new CSS is injected
const profileCSS = `
/* Profile UI */
.pf-header { padding: 2rem 1.5rem; display: flex; align-items: center; gap: 1.5rem; border-bottom: 1px solid var(--ma-border); }
.pf-ava { position: relative; width: 70px; height: 70px; border-radius: 50%; border: 2px solid #fff; background: url('https://api.dicebear.com/7.x/avataaars/svg?seed=Felix') center/cover; }
.pf-cam { position: absolute; bottom: -5px; right: -5px; width: 24px; height: 24px; background: transparent; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid #f0b90b; }
.pf-cam svg { width: 14px; height: 14px; stroke: #f0b90b; fill: none; stroke-width: 2; }
.pf-name { font-size: 1.2rem; font-weight: 700; color: #fff; margin-bottom:0.2rem;}
.pf-handle { font-size: 0.8rem; color: var(--ma-sub); margin-bottom: 0.8rem; }
.pf-btn-outline { border: 1px solid #f0b90b; color: #f0b90b; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.7rem; font-weight: 600; display: inline-block; cursor: pointer; transition: all 0.2s;}
.pf-btn-outline.active { background: #f0b90b; color: #000; border-color: #f0b90b; }

.pf-stats { display: flex; justify-content: space-around; padding: 1.5rem 0; border-bottom: 1px solid var(--ma-border); }
.pf-stat { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
.pf-stat-val { font-size: 1.1rem; font-weight: 700; color: #fff; }
.pf-stat-lbl { font-size: 0.6rem; color: var(--ma-sub); letter-spacing: 0.5px; }

.pf-menu-item { padding: 1.2rem 1.5rem; border-bottom: 1px solid var(--ma-border); display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
.pf-menu-left { display: flex; align-items: center; gap: 1rem; }
.pf-menu-ico { width: 20px; height: 20px; stroke: var(--ma-sub); fill: none; stroke-width: 2; }
.pf-menu-title { font-size: 0.9rem; font-weight: 600; color: #fff; }
.pf-menu-sub { font-size: 0.7rem; color: var(--ma-sub); margin-top: 0.2rem; }
.pf-menu-right { color: var(--ma-sub); font-size: 0.8rem; }
.pf-text-yellow { color: #f0b90b; font-weight: 600; font-size: 0.8rem; }

/* Expanded sections */
.pf-expanded { background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--ma-border); padding: 0 0; display: none; overflow: hidden; }
.pf-pm-row { padding: 1rem 1.5rem; border-bottom: 1px solid var(--ma-border); display: flex; justify-content: space-between; align-items: center; }
.pf-pm-left { display: flex; align-items: center; gap: 0.8rem; }
.pf-pm-title { font-size: 0.8rem; font-weight: 600; color: var(--ma-sub); }
.pf-pm-val { font-size: 0.8rem; color: var(--ma-sub); margin-top: 0.4rem; }
.pf-pm-icon { width: 16px; height: 16px; border-radius: 50%; }

.pf-form { padding: 1.5rem; display: none; border-bottom: 1px solid var(--ma-border); background: var(--ma-bg); }
.pf-textarea { width: 100%; height: 80px; background: transparent; border: 1px solid var(--ma-border); border-radius: 8px; padding: 1rem; color: #fff; font-size: 0.85rem; resize: none; margin-bottom: 1rem; box-sizing: border-box; font-family: 'DM Sans', sans-serif;}
.pf-input-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
.pf-input-wrap { display: flex; flex-direction: column; gap: 0.5rem; }
.pf-input { background: transparent; border: 1px solid var(--ma-border); border-radius: 8px; padding: 0.8rem; color: #fff; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; }
.pf-input span { color: var(--ma-sub); }
.pf-btn-solid { width: 100%; background: #f0b90b; color: #000; border-radius: 8px; padding: 1rem; font-weight: 700; font-size: 0.9rem; text-align: center; cursor: pointer; transition: transform 0.2s; }

.pf-rw-form { padding: 1rem 1.5rem; display: none; border-bottom: 1px solid var(--ma-border); }
.pf-rw-input { width: 100%; background: transparent; border: 1px solid #f0b90b; border-radius: 8px; padding: 0.8rem; color: #fff; font-size: 0.85rem; margin-bottom: 1rem; box-sizing: border-box; }
.pf-rw-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
`;

if (!html.includes('.pf-header')) {
  html = html.replace('</style>', profileCSS + '\n</style>');
}

// Modify playFlow function string
const profileScript = `
  } else if (flow === 'profile') {
    miniappLayer.innerHTML = \`
      <div class="demo-cursor" id="cursor"></div>
      <div class="ma-content" id="form-scroll">
        <div class="pf-header">
          <div class="pf-ava">
            <div class="pf-cam"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></div>
          </div>
          <div>
            <div class="pf-name">Cryptowolf07</div>
            <div class="pf-handle">@Cryptowolf07</div>
            <div class="pf-btn-outline" id="btn-edit-bio">Edit Bio & Socials</div>
          </div>
        </div>
        
        <div class="pf-form" id="bio-form">
          <div class="ma-label" style="margin: 0 0 0.5rem 0;">BIO (SHORT DESCRIPTION)</div>
          <textarea class="pf-textarea" id="bio-text"></textarea>
          <div class="pf-input-grid">
            <div class="pf-input-wrap">
              <div class="ma-label" style="margin: 0;">INSTAGRAM HANDLE</div>
              <div class="pf-input"><span>@</span> p2pfather_support</div>
            </div>
            <div class="pf-input-wrap">
              <div class="ma-label" style="margin: 0;">X (TWITTER) HANDLE</div>
              <div class="pf-input"><span>@</span> cryptowolf07</div>
            </div>
          </div>
          <div class="pf-btn-solid" id="btn-save-bio">Save Socials & Bio</div>
        </div>

        <div class="pf-stats">
          <div class="pf-stat"><div class="pf-stat-val">133</div><div class="pf-stat-lbl">30D TRADES</div></div>
          <div class="pf-stat"><div class="pf-stat-val">2210.5</div><div class="pf-stat-lbl">POINTS</div></div>
          <div class="pf-stat"><div class="pf-stat-val">100%</div><div class="pf-stat-lbl">TRUST SCORE</div></div>
        </div>

        <div class="pf-menu-item">
          <div class="pf-menu-left">
            <svg class="pf-menu-ico" style="stroke:#0ecb81;" viewBox="0 0 24 24"><path d="M2 20h20M5 20V10M12 20V4M19 20v-6"></path></svg>
            <div><div class="pf-menu-title" style="color:#f0b90b;">Leaderboard</div><div class="pf-menu-sub">Win rewards & incentives</div></div>
          </div>
          <div class="pf-menu-right">></div>
        </div>

        <div class="pf-menu-item" id="btn-pm">
          <div class="pf-menu-left">
            <svg class="pf-menu-ico" style="stroke:#00bcd4;" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
            <div class="pf-menu-title">Payment Methods</div>
          </div>
          <div class="pf-menu-right" id="pm-chevron">></div>
        </div>

        <div class="pf-expanded" id="pm-list">
          <div class="pf-pm-row">
            <div><div class="pf-pm-left"><div class="pf-pm-icon" style="background:#037dd6;"></div><div class="pf-pm-title">UPI ID</div></div><div class="pf-pm-val">9876543210@mbkns</div></div>
            <div class="pf-text-yellow">Edit</div>
          </div>
          <div class="pf-pm-row">
            <div><div class="pf-pm-left"><div class="pf-pm-icon" style="background:#0ecb81;"></div><div class="pf-pm-title" style="color:#fff;">Digital Rupee (e₹)</div></div><div class="pf-pm-val">Not set</div></div>
            <div class="pf-text-yellow">Add</div>
          </div>
          <div class="pf-pm-row">
            <div><div class="pf-pm-left"><div class="pf-pm-icon" style="background:#3b5998;"></div><div class="pf-pm-title">Phone Number</div></div><div class="pf-pm-val">9876543210</div></div>
            <div class="pf-text-yellow">Edit</div>
          </div>
        </div>

        <div class="pf-menu-item" style="border:none;">
          <div class="pf-menu-left">
            <svg class="pf-menu-ico" style="stroke:#0ecb81;" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
            <div><div class="pf-menu-title">Receiving Wallet</div><div class="pf-menu-sub" id="rw-sub">Not set</div></div>
          </div>
          <div class="pf-text-yellow" id="btn-rw-add">Add</div>
        </div>

        <div class="pf-rw-form" id="rw-form">
          <input type="text" class="pf-rw-input" id="rw-input" placeholder="0x..." readonly />
          <div class="pf-rw-btns">
            <div class="pf-btn-solid" style="background:#f0b90b; color:#000;">Save</div>
            <div class="pf-btn-solid" id="btn-rw-def" style="background:#f0b90b; color:#000;">Use Default</div>
          </div>
        </div>

      </div>
      \${renderNav('profile')}
    \`;

    const c = document.getElementById('cursor');
    const scrollArea = document.getElementById('form-scroll');
    const btnEditBio = document.getElementById('btn-edit-bio');
    const bioForm = document.getElementById('bio-form');
    const bioText = document.getElementById('bio-text');
    const btnSaveBio = document.getElementById('btn-save-bio');
    
    const btnPm = document.getElementById('btn-pm');
    const pmList = document.getElementById('pm-list');
    
    const btnRwAdd = document.getElementById('btn-rw-add');
    const rwForm = document.getElementById('rw-form');
    const btnRwDef = document.getElementById('btn-rw-def');
    const rwSub = document.getElementById('rw-sub');
    const toast = document.getElementById('toast');

    // Phase 1: Bio Edit
    demoTimeouts.push(setTimeout(() => { c.style.opacity = '1'; c.style.transform = 'translate(150px, 120px)'; }, 1000));
    demoTimeouts.push(setTimeout(() => { 
      btnEditBio.classList.add('btn-clicked'); 
      btnEditBio.innerText = "Cancel Editing";
      btnEditBio.style.color = "#f0b90b";
    }, 2500));
    demoTimeouts.push(setTimeout(() => { 
      bioForm.style.display = 'block'; 
      c.style.transform = 'translate(100px, 250px)';
    }, 2800));
    demoTimeouts.push(setTimeout(() => { bioText.value = "Web3 dev"; }, 4000));
    demoTimeouts.push(setTimeout(() => { bioText.value = "Web3 dev • founder of p2pfather"; }, 4600));
    demoTimeouts.push(setTimeout(() => { bioText.value = "Web3 dev • founder of p2pfather • Shipping real products"; }, 5200));
    
    demoTimeouts.push(setTimeout(() => { scrollArea.scrollTop = 150; c.style.transform = 'translate(150px, 520px)'; }, 6500));
    demoTimeouts.push(setTimeout(() => { btnSaveBio.classList.add('btn-clicked'); }, 7800));
    demoTimeouts.push(setTimeout(() => { 
      bioForm.style.display = 'none'; 
      btnEditBio.innerText = "Edit Bio & Socials";
      scrollArea.scrollTop = 0;
    }, 8200));

    // Phase 2: Payment Methods
    demoTimeouts.push(setTimeout(() => { scrollArea.scrollTop = 100; c.style.transform = 'translate(150px, 360px)'; }, 9500));
    demoTimeouts.push(setTimeout(() => { btnPm.classList.add('btn-clicked'); }, 10500));
    demoTimeouts.push(setTimeout(() => { pmList.style.display = 'block'; document.getElementById('pm-chevron').innerHTML = 'v'; }, 10800));

    // Phase 3: Receiving Wallet
    demoTimeouts.push(setTimeout(() => { scrollArea.scrollTop = 450; c.style.transform = 'translate(280px, 500px)'; }, 12500));
    demoTimeouts.push(setTimeout(() => { btnRwAdd.classList.add('btn-clicked'); }, 13800));
    demoTimeouts.push(setTimeout(() => { 
      rwForm.style.display = 'block';
      btnRwAdd.innerText = "Cancel";
      scrollArea.scrollTop = 600;
      c.style.transform = 'translate(220px, 600px)';
    }, 14100));

    demoTimeouts.push(setTimeout(() => { btnRwDef.classList.add('btn-clicked'); }, 15500));
    demoTimeouts.push(setTimeout(() => { 
      rwForm.style.display = 'none';
      btnRwAdd.innerText = "Add";
      rwSub.innerText = "Default: 0x6C31...3154";
      c.style.opacity = '0';
      toast.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg> Profile Updated!';
      toast.classList.add('show');
    }, 15900));

    demoTimeouts.push(setTimeout(() => { toast.classList.remove('show'); }, 18500));
  }
}
`;

if (!html.includes("flow === 'profile'")) {
  html = html.replace(/  } else if \(flow === 'vault'\) {[\s\S]*?toast\.classList\.remove\('show'\);\n    }, 12000\)\);\n  }\n}/, match => {
    return match.replace("  }\n}", profileScript);
  });
}

fs.writeFileSync('public/index.html', html);
console.log("Profile Setup built.");
