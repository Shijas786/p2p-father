import re

with open('miniapp/src/App.tsx', 'r') as f:
    content = f.read()

# Replace handleSwitchWallet
old_switch = """      if (user?.wallet_type === 'external') {
        setConnecting(true);
        api.wallet.connectBot()
          .then(() => refreshUser())
          .then(() => {
            setWalletMode('bot');
            setConnecting(false);
          })
          .catch(err => {
            console.error('[P2P] Switch failed:', err);
            setConnecting(false);
          });
      } else {
        setWalletMode('external');
        if (isConnected && address) {
          setConnecting(true);
          api.wallet.connectExternal(address)
            .then(() => refreshUser())
            .then(() => setConnecting(false))
            .catch(() => setConnecting(false));
        } else {
          await appKit.open();
        }
      }"""

new_switch = """      if (user?.wallet_type === 'external') {
        setConnecting(true);
        api.wallet.connectBot()
          .then(() => refreshUser())
          .then(() => {
            setWalletMode('bot');
            setConnecting(false);
          })
          .catch(err => {
            console.error('[P2P] Switch failed:', err);
            setConnecting(false);
          });
      } else {
        setWalletMode('external');
        if (isConnected && connector?.id === 'hotWallet') {
          console.log('[P2P] Disconnecting hot wallet before opening external...');
          disconnect();
          await new Promise(resolve => setTimeout(resolve, 500)); // allow wagmi state to clear
          await appKit.open();
        } else if (isConnected && address && connector?.id !== 'hotWallet') {
          setConnecting(true);
          api.wallet.connectExternal(address)
            .then(() => refreshUser())
            .then(() => setConnecting(false))
            .catch(() => setConnecting(false));
        } else {
          await appKit.open();
        }
      }"""

content = content.replace(old_switch, new_switch)

# Fix WalletSelector initial click as well to disconnect hot wallet if needed
old_selector = """        onSelectExternal={async () => {
          setWalletMode('external');
          console.log('[P2P] Opening WalletConnect modal...');
          appKit.open();
        }}"""

new_selector = """        onSelectExternal={async () => {
          setWalletMode('external');
          if (isConnected && connector?.id === 'hotWallet') {
              disconnect();
              await new Promise(resolve => setTimeout(resolve, 500));
          }
          console.log('[P2P] Opening WalletConnect modal...');
          appKit.open();
        }}"""
        
content = content.replace(old_selector, new_selector)

with open('miniapp/src/App.tsx', 'w') as f:
    f.write(content)
