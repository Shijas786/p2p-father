import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// ── Hide reown "UX by reown" mascot from AppKit modal (shadow DOM injection) ──
const hideReownBranding = () => {
  const modal = document.querySelector('w3m-modal');
  if (!modal?.shadowRoot) return;
  if (modal.shadowRoot.querySelector('#hide-reown-style')) return; // already injected

  const style = document.createElement('style');
  style.id = 'hide-reown-style';
  style.textContent = `
    wui-ux-by-reown,
    w3m-legal-footer,
    [data-testid="w3m-ux-by-reown"] { display: none !important; }
  `;
  modal.shadowRoot.appendChild(style);
};

// Watch for the modal to be added/opened
const observer = new MutationObserver(() => hideReownBranding());
observer.observe(document.body, { childList: true, subtree: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
