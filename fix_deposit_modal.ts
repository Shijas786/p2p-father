import fs from 'fs';

let content = fs.readFileSync('miniapp/src/components/DepositModal.tsx', 'utf8');

// 1. Add initialMode to props
content = content.replace(
    '    onWithdraw?: () => void;\n}',
    '    onWithdraw?: () => void;\n    initialMode?: "deposit" | "withdraw";\n}'
);

// 2. Add initialMode to destructured props
content = content.replace(
    'export function DepositModal({ onClose, balances, loadBalances, copyAddress, haptic, onWithdraw }: DepositModalProps) {',
    'export function DepositModal({ onClose, balances, loadBalances, copyAddress, haptic, onWithdraw, initialMode = "deposit" }: DepositModalProps) {'
);

// 3. Use initialMode for mode state
content = content.replace(
    'const [mode, setMode] = useState<\'deposit\'|\'withdraw\'>(\'deposit\');',
    'const [mode, setMode] = useState<\'deposit\'|\'withdraw\'>(initialMode);'
);

fs.writeFileSync('miniapp/src/components/DepositModal.tsx', content);
