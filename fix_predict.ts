import fs from 'fs';

let content = fs.readFileSync('miniapp/src/pages/Predict.tsx', 'utf8');

// Add depositModalMode state
content = content.replace(
    'const [showDepositModal, setShowDepositModal]     = useState(false);',
    'const [showDepositModal, setShowDepositModal]     = useState(false);\n    const [depositModalMode, setDepositModalMode]     = useState<\'deposit\'|\'withdraw\'>(\'deposit\');'
);

// Update handleOpenDeposit
content = content.replace(
    'haptic(\'selection\'); setShowDepositModal(true);',
    'haptic(\'selection\'); setDepositModalMode(\'deposit\'); setShowDepositModal(true);'
);

// Update handleOpenWithdraw
content = content.replace(
    `    const handleOpenWithdraw = () => {
        haptic('selection');
        setShowDepositModal(false);
        setWithdrawRecipient(user?.wallet_address || '');
        setWithdrawAmount('');
        setShowWithdrawModal(true);
    };`,
    `    const handleOpenWithdraw = () => {
        haptic('selection');
        setDepositModalMode('withdraw');
        setShowDepositModal(true);
    };`
);

// Update DepositModal usage
content = content.replace(
    '<DepositModal \n                    onClose={() => setShowDepositModal(false)}',
    '<DepositModal \n                    initialMode={depositModalMode}\n                    onClose={() => setShowDepositModal(false)}'
);

// Remove showWithdrawModal usage
// Since there's a large block for {showWithdrawModal && ( ... )}, we can just replace it entirely.
const withdrawModalStart = '{/* ══ WITHDRAW MODAL ══════════════════════════════════════════ */}';
const startIndex = content.indexOf(withdrawModalStart);
if (startIndex !== -1) {
    const endStr = '</svg>\n                            </button>\n                        </div>\n                    </div>\n                </div>\n            )}';
    const endIndex = content.indexOf(endStr, startIndex);
    if (endIndex !== -1) {
        content = content.slice(0, startIndex) + content.slice(endIndex + endStr.length);
    }
}

fs.writeFileSync('miniapp/src/pages/Predict.tsx', content);
