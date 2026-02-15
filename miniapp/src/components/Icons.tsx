// ═══════════════════════════════════════════════════════════════
//  SVG Icon System — Clean, crisp inline SVG icons
//  Replaces all emoji placeholders for a premium, professional look
// ═══════════════════════════════════════════════════════════════

interface IconProps {
    size?: number;
    color?: string;
    className?: string;
}

const defaults = { size: 24, color: 'currentColor' };

export function IconHome({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
            <path d="M9 21V12h6v9" />
        </svg>
    );
}

export function IconMarket({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M3 3v18h18" />
            <path d="M7 16l4-8 4 4 5-6" />
        </svg>
    );
}

export function IconPlus({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

export function IconX({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

export function IconArrowRight({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    );
}

export function IconWallet({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <path d="M2 10h20" />
            <circle cx="17" cy="14" r="1.5" fill={color} />
            <path d="M6 6V4a2 2 0 012-2h8a2 2 0 012 2v2" />
        </svg>
    );
}

export function IconUser({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
        </svg>
    );
}

export function IconSell({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
            <circle cx="12" cy="12" r="10" fill="#ef4444" opacity="0.15" />
            <circle cx="12" cy="12" r="6" fill="#ef4444" opacity="0.3" />
            <path d="M12 8v8M8 12l4 4 4-4" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconBuy({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
            <circle cx="12" cy="12" r="10" fill="#22c55e" opacity="0.15" />
            <circle cx="12" cy="12" r="6" fill="#22c55e" opacity="0.3" />
            <path d="M12 16V8M8 12l4-4 4 4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconSend({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22l-4-9-9-4L22 2z" />
        </svg>
    );
}

export function IconBridge({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M4 18c0-6 4-10 8-10s8 4 8 10" />
            <line x1="2" y1="18" x2="22" y2="18" />
            <line x1="7" y1="18" x2="7" y2="14" />
            <line x1="12" y1="18" x2="12" y2="8" />
            <line x1="17" y1="18" x2="17" y2="14" />
        </svg>
    );
}

export function IconRefresh({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0115.36-6.36L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 01-15.36 6.36L3 16" />
        </svg>
    );
}

export function IconShield({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 2l8 4v6c0 5.25-3.5 9.5-8 11-4.5-1.5-8-5.75-8-11V6l8-4z" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}

export function IconLink({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
    );
}

export function IconBot({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="3" y="8" width="18" height="12" rx="3" />
            <circle cx="9" cy="14" r="1.5" fill={color} />
            <circle cx="15" cy="14" r="1.5" fill={color} />
            <line x1="12" y1="4" x2="12" y2="8" />
            <circle cx="12" cy="3" r="1" fill={color} />
        </svg>
    );
}

export function IconEmpty({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
            <path d="M12 15l-2-2m0 0l2-2m-2 2h4" />
        </svg>
    );
}

export function IconArrowUp({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
        </svg>
    );
}

export function IconArrowDown({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
        </svg>
    );
}

export function IconSwap({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M7 4v16M7 20l-3-3m3 3l3-3" />
            <path d="M17 20V4m0 0l3 3m-3-3l-3 3" />
        </svg>
    );
}

export function IconCopy({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
    );
}

export function IconCheck({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

export function IconPhone({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="5" y="2" width="14" height="20" rx="3" />
            <line x1="12" y1="18" x2="12" y2="18.01" />
        </svg>
    );
}

export function IconLock({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
    );
}

export function IconInfo({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

export function IconWarning({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}

export function IconReceive({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
            <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
    );
}

export function IconStar({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26" />
        </svg>
    );
}

// Token Icons — filled circles with symbol
export function IconTokenETH({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="12" fill="#627eea" />
            <path d="M12 3.5l-.2.6v11l.2.2.2-.2V4.1L12 3.5z" fill="#fff" opacity="0.6" />
            <path d="M12 3.5L7.5 12.2 12 15.1V3.5z" fill="#fff" opacity="0.8" />
            <path d="M12 3.5v11.6l4.5-2.9L12 3.5z" fill="#fff" />
            <path d="M12 16.2l-.1.1v3.5l.1.2.1-.2v-3.5l-.1-.1z" fill="#fff" opacity="0.6" />
            <path d="M12 20L7.5 13.3 12 16.2V20z" fill="#fff" opacity="0.8" />
            <path d="M12 20v-3.8l4.5-2.9L12 20z" fill="#fff" />
        </svg>
    );
}

export function IconTokenUSDC({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="12" fill="#2775ca" />
            <path d="M12 4.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zm0 13.5a6 6 0 110-12 6 6 0 010 12z" fill="#fff" opacity="0.3" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="system-ui">$</text>
        </svg>
    );
}

export function IconTokenUSDT({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="12" fill="#26a17b" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="system-ui">₮</text>
        </svg>
    );
}

// Chain Icons
export function IconChainBase({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#0052ff" />
            <circle cx="12" cy="12" r="6" fill="none" stroke="white" strokeWidth="2.5" />
        </svg>
    );
}

export function IconChainEth({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#627eea" />
            <path d="M12 4l5 8-5 3-5-3 5-8z" fill="white" opacity="0.9" />
            <path d="M12 16.5l5-3.5-5 7-5-7 5 3.5z" fill="white" opacity="0.7" />
        </svg>
    );
}

export function IconChainPolygon({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#8247e5" />
            <path d="M15.5 9.5l-2.5-1.5-2.5 1.5v3l2.5 1.5 2.5-1.5v-3z" fill="white" opacity="0.9" />
            <path d="M10.5 12.5l-2.5-1.5v3l2.5 1.5 2.5-1.5" fill="white" opacity="0.6" />
        </svg>
    );
}

export function IconChainArbitrum({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#28a0f0" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="system-ui">A</text>
        </svg>
    );
}

export function IconChainOptimism({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#ff0420" />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="system-ui">O</text>
        </svg>
    );
}
export function IconHistory({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

export function IconArrowLeft({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
        </svg>
    );
}
