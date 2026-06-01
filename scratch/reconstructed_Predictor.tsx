"import { useState, useEffect, useRef } from 'react';\nimport { api } from '../lib/api';\nimport { haptic } from '../lib/telegram';\nimport { useToast } from '../components/Toast';\nimport { copyToClipboard, formatError } from '../lib/utils';\nimport { \n    IconTokenBTC, \n    IconTokenUSDC, \n    IconArrowUp, \n    IconArrowDown, \n    IconRefresh, \n    IconCopy, \n    IconInfo, \n    IconChevronRight, \n    IconAlertCircle, \n    IconX \n} from '../components/Icons';\nimport './Predictor.css';

function IconChevronDown({ size = 16, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

function IconChevronLeft({ size = 20, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="15 18 9 12 15 6" />
        </svg>
    );
}

function IconGift({ size = 20, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="20 12 20 22 4 22 4 12" />
            <rect x="2" y="7" width="20" height="5" />
            <line x1="12" y1="22" x2="12" y2="7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
    );
}

function IconBell({ size = 20, color = 'currentColor', className }: { size?: number; color?: string; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    );
}\n\ninterface Props {\n    user: any;\n}\n\nexport function Predictor({ user }: Props) {\n    const { showToast } = useToast();\n    \n    // Core state variables\n    const [market, setMarket] = useState<any>(null);\n    const [prices, setPrices] = useState<any>({ YES: '0.50', NO: '0.50' });\n    const [walletData, setWalletData] = useState<any>(null);\n    const [history, setHistory] = useState<any[]>([]);\n    \n    const [loadingMarket, setLoadingMarket] = useState(true);\n    const [loadingBal, setLoadingBal] = useState(true);\n    const [betOutcome, setBetOutcome] = useState<'YES' | 'NO'>('YES');\n    const [betAmount, setBetAmount] = useState('10');\n    const [placingBet, setPlacingBet] = useState(false);
    const [tradeTab, setTradeTab] = useState<'BUY' | 'SELL'>('BUY');
    const [chartStyle, setChartStyle] = useState<'CANDLES' | 'LINE' | 'BARS'>('CANDLES');\n    \n    // Countdown state\n    const [timeLeft, setTimeLeft] = useState<string>('00:00');\n    const [secondsRemaining, setSecondsRemaining] = useState<number>(0);\n    \n    // Modal states\n    const [showDepositModal, setShowDepositModal] = useState(false);\n    const [showWithdrawModal, setShowWithdrawModal] = useState(false);\n    const [depositAmount, setDepositAmount] = useState('');\n    const [withdrawAmount, setWithdrawAmount] = useState('');\n    const [fundingLoader, setFundingLoader] = useState(false);\n    const [withdrawLoader, setWithdrawLoader] = useState(false);\n    \n    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const profileDropdownRef = useRef<HTMLDivElement | null>(null);
    const chainDropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
                setShowWalletDropdown(false);
            }
            if (chainDropdownRef.current && !chainDropdownRef.current.contains(event.target as Node)) {
                setShowChainDropdown(false);
            }
            if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);\n\n    useEffect(() => {\n        loadActiveMarket();\n        loadBalance();\n        loadHistory();\n        \n        // Setup polling every 6 seconds to fetch upda
<truncated 24649 bytes>