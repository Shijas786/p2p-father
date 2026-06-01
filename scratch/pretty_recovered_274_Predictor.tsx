"import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { haptic } from '../lib/telegram';
import { useToast } from '../components/Toast';
import { copyToClipboard, formatError } from '../lib/utils';
import { 
    IconTokenBTC, 
    IconTokenUSDC, 
    IconArrowUp, 
    IconArrowDown, 
    IconRefresh, 
    IconCopy, 
    IconInfo, 
    IconChevronRight, 
    IconAlertCircle, 
    IconX 
} from '../components/Icons';
import './Predictor.css';

interface Props {
    user: any;
}

export function Predictor({ user }: Props) {
    const { showToast } = useToast();
    
    // Core state variables
    const [market, setMarket] = useState<any>(null);
    const [prices, setPrices] = useState<any>({ YES: '0.50', NO: '0.50' });
    const [walletData, setWalletData] = useState<any>(null);
    const [history, setHistory] = useState<any[]>([]);
    
    const [loadingMarket, setLoadingMarket] = useState(true);
    const [loadingBal, setLoadingBal] = useState(true);
    const [betOutcome, setBetOutcome] = useState<'YES' | 'NO'>('YES');
    const [betAmount, setBetAmount] = useState('10');
    const [placingBet, setPlacingBet] = useState(false);
    
    // Countdown state
    const [timeLeft, setTimeLeft] = useState<string>('00:00');
    const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
    
    // Modal states
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [fundingLoader, setFundingLoader] = useState(false);
    const [withdrawLoader, setWithdrawLoader] = useState(false);
    
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadActiveMarket();
        loadBalance();
        loadHistory();
        
        // Setup polling every 6 seconds to fetch upda
<truncated 24649 bytes>