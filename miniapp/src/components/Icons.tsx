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

/** 🕶️ Custom Profile Icon with Cooling Glasses */
/** 👤 Professional Binance-style Profile Icon */
export function IconProfile({ size = 28, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
            {/* Minimalist Outer Ring */}
            <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.2" opacity="0.1" />
            
            {/* Professional Silhouette Head */}
            <circle cx="12" cy="8.5" r="3.8" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
            
            {/* Professional Silhouette Shoulders */}
            <path 
                d="M5.5 19.5C5.5 16.5 8.5 14 12 14C15.5 14 18.5 16.5 18.5 19.5" 
                stroke="currentColor" 
                strokeWidth="1.8" 
                strokeLinecap="round" 
            />
            
            <style>{`
                .active .IconProfile, .nav-tab.active svg {
                    filter: drop-shadow(0 0 3px rgba(240, 185, 11, 0.2));
                }
            `}</style>
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
            <defs>
                <linearGradient id="ethDarkGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#1e1e24" />
                    <stop offset="100%" stopColor="#0a0a0d" />
                </linearGradient>
                <linearGradient id="ethSymbolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ecf0f9" />
                    <stop offset="100%" stopColor="#8c9cb6" />
                </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="11.5" fill="url(#ethDarkGrad)" stroke="#33333f" strokeWidth="1" />
            <g transform="translate(1.5, 1.5) scale(0.87)">
                <path d="M12 3.5l-.2.6v11l.2.2.2-.2V4.1L12 3.5z" fill="url(#ethSymbolGrad)" opacity="0.6" />
                <path d="M12 3.5L7.5 12.2 12 15.1V3.5z" fill="url(#ethSymbolGrad)" opacity="0.85" />
                <path d="M12 3.5v11.6l4.5-2.9L12 3.5z" fill="url(#ethSymbolGrad)" />
                <path d="M12 16.2l-.1.1v3.5l.1.2.1-.2v-3.5l-.1-.1z" fill="url(#ethSymbolGrad)" opacity="0.6" />
                <path d="M12 20L7.5 13.3 12 16.2V20z" fill="url(#ethSymbolGrad)" opacity="0.85" />
                <path d="M12 20v-3.8l4.5-2.9L12 20z" fill="url(#ethSymbolGrad)" />
            </g>
        </svg>
    );
}

export function IconTokenUSDC({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
            <circle cx="16" cy="16" r="16" fill="#2775CA" />
            <path d="M20.022 18.124c0-2.124-1.276-2.852-3.829-3.156-1.829-.243-2.193-.73-2.193-1.578 0-.85.607-1.397 1.822-1.397 1.092 0 1.701.364 2.01 1.276a.364.364 0 00.34.243h.77a.334.334 0 00.333-.334v-.06a3.04 3.04 0 00-2.73-2.49V9.333a.364.364 0 00-.364-.364h-.728a.364.364 0 00-.364.364v1.276c-1.822.242-2.976 1.456-2.976 2.974 0 2.002 1.215 2.791 3.768 3.095 1.701.303 2.254.668 2.254 1.639 0 .97-.85 1.638-2.01 1.638-1.578 0-2.133-.667-2.315-1.578a.36.36 0 00-.35-.303h-.8a.334.334 0 00-.333.334v.06c.212 1.7 1.367 2.913 3.098 3.218v1.278c0 .2.163.364.364.364h.728a.364.364 0 00.364-.364v-1.278c1.822-.303 3.07-1.578 3.07-3.158z" fill="white" />
            <path d="M13.368 23.28c-3.96-1.395-6.005-5.78-4.545-9.676a7.33 7.33 0 014.545-4.484.38.38 0 00.243-.364V8a.34.34 0 00-.455-.334c-4.79 1.517-7.402 6.607-5.885 11.397a9.404 9.404 0 005.885 5.886.34.34 0 00.455-.335v-.97a.416.416 0 00-.243-.363z" fill="white" opacity="0.6" />
            <path d="M17.09 7.666a.34.34 0 00-.455.334v.757c0 .182.122.334.304.364 3.96 1.396 6.005 5.78 4.545 9.677a7.33 7.33 0 01-4.545 4.484.38.38 0 00-.304.364v.757a.34.34 0 00.455.334c4.79-1.516 7.402-6.607 5.885-11.396A9.44 9.44 0 0017.09 7.666z" fill="white" opacity="0.6" />
        </svg>
    );
}

export function IconTokenUSDT({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none">
            <circle cx="12" cy="12" r="11.5" fill="#00AF84" />
            <circle cx="12" cy="12" r="9.2" stroke="white" strokeWidth="0.7" opacity="0.35" fill="none" />
            <path d="M7.5 8.5h9M12 8.5v9M9.5 12h5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function IconTokenBNB({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <defs>
                <linearGradient id="bnbDarkGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#241e0b" />
                    <stop offset="100%" stopColor="#0d0a04" />
                </linearGradient>
                <linearGradient id="bnbSymbolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffdf6d" />
                    <stop offset="100%" stopColor="#f0b90b" />
                </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="11.5" fill="url(#bnbDarkGrad)" stroke="#423512" strokeWidth="1" />
            <g transform="translate(1.5, 1.5) scale(0.87)" fill="url(#bnbSymbolGrad)">
                <path d="M12 6.5l2.5 2.5-2.5 2.5-2.5-2.5 2.5-2.5zM12 17.5l2.5-2.5-2.5-2.5-2.5 2.5 2.5 2.5zM17.5 12l-2.5 2.5-2.5-2.5 2.5-2.5 2.5 2.5zM6.5 12l2.5-2.5 2.5 2.5-2.5 2.5-2.5-2.5z" />
            </g>
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

export function IconChainBsc({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#F0B90B" />
            <path d="M12 7l1.75 1.75L12 10.5l-1.75-1.75L12 7zM12 14.5l1.75 1.75L12 18l-1.75-1.75L12 14.5zM15.5 10.75l1.75 1.75L15.5 14.25l-1.75-1.75L15.5 10.75zM8.5 10.75l1.75 1.75L8.5 14.25l-1.75-1.75L8.5 10.75z" fill="black" />
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
        <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none">
            <circle cx="16" cy="16" r="16" fill="#8247E5" />
            <path d="M21.092 13.394a1.045 1.045 0 00-1.048 0l-2.428 1.408-1.648.933-2.428 1.408a1.045 1.045 0 01-1.048 0l-1.916-1.11a1.03 1.03 0 01-.524-.894V13.16c0-.36.195-.7.524-.894l1.916-1.11a1.045 1.045 0 011.048 0l1.916 1.11c.33.194.524.533.524.894v1.408l1.648-.952v-1.408a1.03 1.03 0 00-.524-.894l-3.54-2.043a1.045 1.045 0 00-1.048 0L9.98 11.314a1.03 1.03 0 00-.524.894v4.087c0 .36.195.7.524.894l3.564 2.043a1.045 1.045 0 001.048 0l2.428-1.388 1.648-.952 2.428-1.388a1.045 1.045 0 011.048 0l1.916 1.11c.33.194.524.533.524.894v1.978c0 .36-.195.7-.524.894l-1.916 1.11a1.045 1.045 0 01-1.048 0l-1.916-1.11a1.03 1.03 0 01-.524-.894v-1.408l-1.648.952v1.408c0 .36.195.7.524.894l3.564 2.043a1.045 1.045 0 001.048 0l3.564-2.043c.33-.194.524-.533.524-.894v-4.087a1.03 1.03 0 00-.524-.894l-3.588-2.063z" fill="white" />
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

export function IconMegaphone({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18.8 6c.45 0 .8.36.8.8V17.2c0 .44-.35.8-.8.8l-4.3-.4c-.45-.04-1.3-.1-1.3-.1s-4.8 5.4-5.2 5.4-.4-.4-.4-.4l.8-5.7H4.4c-.44 0-.8-.36-.8-.8V6.8c0-.44.36-.8.8-.8h14.4z" />
            <path d="M13.2 6V5a2 2 0 00-2-2 2 2 0 00-2 2v1" opacity="0.5" />
        </svg>
    );
}

export function IconPhoneMock({ size = 40, className }: IconProps) {
    return (
        <svg width={size} height={size * 1.5} viewBox="0 0 24 36" fill="none" className={className}>
            <rect width="24" height="36" rx="4" fill="#374151" />
            <rect x="2" y="3" width="20" height="26" rx="1" fill="#1f2937" />
            <rect x="8" y="31" width="8" height="2" rx="1" fill="#4B5563" />
            <rect x="10" y="31" width="4" height="2" rx="1" fill="#1f2937" opacity="0.3" />
            <path d="M6 8h12M6 12h12M6 16h8" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
    );
}

export function IconCoins({ size = 40, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
            <circle cx="20" cy="20" r="14" fill="#4b5563" />
            <circle cx="20" cy="20" r="14" stroke="#9ca3af" strokeWidth="2" />
            <text x="20" y="27" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" fontFamily="system-ui">₹</text>
            <circle cx="12" cy="28" r="10" fill="#374151" stroke="#9ca3af" strokeWidth="1.5" />
            <text x="12" y="34" textAnchor="middle" fill="#9ca3af" fontSize="14" fontWeight="bold" fontFamily="system-ui">₹</text>
        </svg>
    );
}

export function IconSearchMagnify({ size = 40, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className}>
            <rect x="5" y="5" width="25" height="25" rx="2" fill="#374151" opacity="0.5" />
            <path d="M8 10h19M8 15h19M8 20h12" stroke="#4b5563" strokeWidth="2" />
            <circle cx="25" cy="25" r="8" fill="#1f2937" stroke="#3b82f6" strokeWidth="2" />
            <line x1="30" y1="30" x2="36" y2="36" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
            <text x="25" y="27" textAnchor="middle" fill="#3b82f6" fontSize="6" fontWeight="800">Match</text>
        </svg>
    );
}

export function IconChevronRight({ size = defaults.size, color = 'white', className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

export function IconTokenBTC({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="12" fill="#f7931a" />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold" fontFamily="system-ui">₿</text>
        </svg>
    );
}

export function IconQr({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="8" x2="16" y2="8"></line>
            <line x1="8" y1="8" x2="8" y2="8"></line>
            <line x1="8" y1="16" x2="8" y2="16"></line>
            <line x1="16" y1="16" x2="16" y2="16"></line>
        </svg>
    );
}
export function IconFilter({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="2" y1="14" x2="6" y2="14" />
            <line x1="10" y1="8" x2="14" y2="8" />
            <line x1="18" y1="16" x2="22" y2="16" />
        </svg>
    );
}

export function IconExternalLink({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
    );
}

export function IconHourglass({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M5 2h14M5 22h14M15 2v5l-3 3-3-3V2M9 22v-5l3-3 3 3v5" />
        </svg>
    );
}

export function IconAlertCircle({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    );
}

export function IconInstagram({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
        </svg>
    );
}

export function IconSocialX({ size = defaults.size, color = defaults.color, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M4 4l11.733 16h4.267l-11.733-16z" />
            <path d="M4 20l6.768-6.768m2.464-2.464l6.768-6.768" opacity="0.5" />
        </svg>
    );
}

export function IconChainMonad({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#836EFD" />
            <path d="M7 16V8l5 5 5-5v8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
    );
}

export function IconChainRonin({ size = defaults.size, className }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
            <circle cx="12" cy="12" r="11" fill="#123fe5" />
            <text x="12" y="16.5" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold" fontFamily="system-ui">R</text>
        </svg>
    );
}

export function IconTelegram({ size = 16, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <circle cx="12" cy="12" r="12" fill="#2AABEE" />
            <path d="M17.5 7.5L5.5 12.1L9.2 13.5L14.7 9.8L10.5 14.8L10.3 18L12.7 15.8L15.6 18L17.5 7.5Z" fill="white" />
        </svg>
    );
}

export function IconWhatsApp({ size = 16, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <circle cx="12" cy="12" r="12" fill="#25D366" />
            <path d="M12.04 4.5C7.9 4.5 4.53 7.87 4.53 12.01C4.53 13.34 4.88 14.62 5.53 15.76L4.5 19.5L8.38 18.49C9.48 19.08 10.72 19.4 12.04 19.4C16.18 19.4 19.55 16.03 19.55 11.89C19.55 7.75 16.18 4.5 12.04 4.5ZM15.48 13.9C15.29 13.8 14.37 13.35 14.2 13.29C14.03 13.23 13.91 13.19 13.79 13.38C13.66 13.57 13.3 13.99 13.19 14.12C13.08 14.24 12.97 14.26 12.78 14.17C12.59 14.07 11.99 13.87 11.28 13.24C10.73 12.75 10.36 12.14 10.25 11.95C10.14 11.76 10.24 11.66 10.33 11.56C10.41 11.48 10.52 11.34 10.61 11.23C10.7 11.12 10.73 11.04 10.79 10.92C10.86 10.79 10.83 10.68 10.78 10.58C10.73 10.49 10.36 9.57 10.2 9.2C10.05 8.83 9.9 8.88 9.79 8.88C9.68 8.87 9.55 8.87 9.43 8.87C9.3 8.87 9.09 8.92 8.92 9.11C8.75 9.3 8.26 9.76 8.26 10.68C8.26 11.6 8.94 12.49 9.03 12.62C9.13 12.74 10.36 14.64 12.24 15.45C12.69 15.65 13.04 15.76 13.31 15.85C13.76 15.99 14.17 15.98 14.49 15.93C14.85 15.87 15.6 15.47 15.76 15.03C15.91 14.58 15.91 14.21 15.86 14.13C15.81 14.04 15.68 13.99 15.48 13.9Z" fill="white" />
        </svg>
    );
}

export function IconExternalWeb3({ size = 16, className }: { size?: number; className?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <circle cx="12" cy="12" r="12" fill="#8B5CF6" />
            <path d="M16.5 13.5V14.25C16.5 15.075 15.825 15.75 15 15.75H9C8.175 15.75 7.5 15.075 7.5 14.25V9.75C7.5 8.925 8.175 8.25 9 8.25H15C15.825 8.25 16.5 8.925 16.5 9.75V10.5H12C11.175 10.5 10.5 11.175 10.5 12C10.5 12.825 11.175 13.5 12 13.5H16.5ZM12 12.75H17.25V11.25H12C11.5875 11.25 11.25 11.5875 11.25 12C11.25 12.4125 11.5875 12.75 12 12.75ZM15 12C15 12.4125 14.6625 12.75 14.25 12.75C13.8375 12.75 13.5 12.4125 13.5 12C13.5 11.5875 13.8375 11.25 14.25 11.25C14.6625 11.25 15 11.5875 15 12Z" fill="white" />
        </svg>
    );
}
