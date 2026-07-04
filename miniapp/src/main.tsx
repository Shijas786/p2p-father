import './polyfill'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// Suppress unhandled promise rejections and errors from third-party browser extensions (like SubWallet)
window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event.reason;
    if (!reason) return;

    const reasonStr = typeof reason === 'object' ? (reason.message || reason.stack || String(reason)) : String(reason);
    
    if (
      reasonStr.includes('has not been authorized yet') ||
      reasonStr.includes('not been authorized yet') ||
      reasonStr.includes('chrome-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('[P2PFather] Suppressed extension promise rejection:', reasonStr);
    }
  } catch (err) {
    // Ignore error inside handler
  }
});

window.addEventListener('error', (event) => {
  try {
    const error = event.error;
    const msg = event.message || '';
    const errorStr = error ? (error.message || error.stack || String(error)) : msg;

    if (
      errorStr.includes('has not been authorized yet') ||
      errorStr.includes('not been authorized yet') ||
      errorStr.includes('chrome-extension://')
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('[P2PFather] Suppressed extension uncaught error:', errorStr);
    }
  } catch (err) {
    // Ignore error inside handler
  }
});

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
