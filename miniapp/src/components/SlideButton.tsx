import React, { useState, useRef, useEffect, useCallback } from 'react';
import { haptic } from '../lib/telegram';
import { IconChevronRight } from './Icons';
import './SlideButton.css';

interface SlideButtonProps {
    onComplete: () => void;
    text: string;
    color?: string;
    isLoading?: boolean;
    disabled?: boolean;
}

export const SlideButton: React.FC<SlideButtonProps> = ({ 
    onComplete, 
    text, 
    color = 'var(--green)', 
    isLoading = false,
    disabled = false
}) => {
    const [sliderPos, setSliderPos] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isCompleted, setIsCompleted] = useState(false);
    const [lastHaptic, setLastHaptic] = useState(0);
    
    const trackRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLDivElement>(null);
    const startXRef = useRef(0);
    
    // Calculate max position based on track width
    const getTrackMetrics = () => {
        const trackWidth = trackRef.current?.clientWidth || 0;
        const padding = 4;
        const handleWidth = 80;
        const maxPos = trackWidth - handleWidth - (padding * 2);
        return { trackWidth, padding, handleWidth, maxPos };
    };

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (disabled || isLoading || isCompleted) return;
        setIsDragging(true);
        const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
        startXRef.current = x - sliderPos;
        haptic('light');
    };

    const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!isDragging) return;
        
        const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const { maxPos } = getTrackMetrics();
        
        let newPos = x - startXRef.current;
        newPos = Math.max(0, Math.min(newPos, maxPos));
        
        setSliderPos(newPos);
        
        // Interval Haptics (25%, 50%, 75%)
        const progress = Math.round((newPos / maxPos) * 100);
        const interval = Math.floor(progress / 25) * 25;
        if (interval > 0 && interval < 100 && interval !== lastHaptic) {
            haptic('selection'); // Light tick
            setLastHaptic(interval);
        }
        
        // Success threshold
        if (newPos >= maxPos * 0.98 && !isCompleted) {
            triggerComplete();
        }
    }, [isDragging, isCompleted, lastHaptic]);

    const handleEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        setLastHaptic(0);
        
        if (!isCompleted) {
            setSliderPos(0);
        }
    }, [isDragging, isCompleted]);

    const triggerComplete = () => {
        setIsDragging(false);
        setIsCompleted(true);
        const { maxPos } = getTrackMetrics();
        setSliderPos(maxPos);
        
        haptic('success');
        onComplete();
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleMove);
            window.addEventListener('touchend', handleEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
        };
    }, [isDragging, handleMove, handleEnd]);

    const { maxPos } = getTrackMetrics();
    const progressPercent = maxPos > 0 ? (sliderPos / maxPos) * 100 : 0;

    return (
        <div 
            className={`sb-track ${disabled ? 'disabled' : ''} ${isCompleted ? 'completed' : ''}`}
            ref={trackRef}
            style={{ 
                '--accent': color,
                '--progress': `${progressPercent}%`
            } as any}
        >
            {/* 🌌 High-Fidelity Glass Crypto River */}
            <div className="sb-liquid-container">
                <div className="sb-glass-glare" />
                
                {/* 🌊 Continuous Glass Token Matrix */}
                <div className="sb-matrix">
                    {[...Array(20)].map((_, i) => {
                        const isUSDT = i % 2 === 0;
                        return (
                            <div 
                                key={i} 
                                className={`sb-token depth-${(i % 3) + 1} ${isUSDT ? 'sb-usdt' : 'sb-usdc'}`}
                                style={{ 
                                    '--x-start': `${(i * 20) % 150 - 25}%`,
                                    '--y-start': `${(i * 12) % 80 + 10}%`,
                                    '--delay': `${(i * 0.4)}s`,
                                } as any}
                            >
                                <div className="sb-token-glass">
                                    <div className="sb-token-glare" />
                                    {isUSDT ? (
                                        /* Official USDT Logo SVG */
                                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="50" cy="50" r="50" fill="#26A17B"/>
                                            <path d="M57.4 39.5c0-1.6-.2-3.1-.7-4.5h16v-8H27.3v8h16c-.5 1.4-.7 2.9-.7 4.5v1.4c-6.8.8-11.7 3.5-11.7 6.7 0 3.2 4.9 5.9 11.7 6.7v17.4h14.9V47.5c6.8-.8 11.7-3.5 11.7-6.7 0-3.2-4.9-5.9-11.7-6.7v-1.4z" fill="white"/>
                                        </svg>
                                    ) : (
                                        /* Official USDC Logo SVG */
                                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="50" cy="50" r="50" fill="#2775CA"/>
                                            <path d="M60.5 56.5c1.4-1.2 2.3-2.5 2.7-4 .4-1.5.5-2.9.4-4.2-.1-1.3-.6-2.5-1.3-3.6-.8-1-1.8-1.8-3.1-2.5-1.3-.6-2.9-1-4.7-1.3-1.8-.3-3.9-.5-6.3-.5a39 39 0 0 0-5.5.1V32.3c1-.1 2.1-.2 3.3-.1 1.2 0 2.3.1 3.5.3 1.2.2 2.3.5 3.5 1 .9.4 1.8 1 2.6 1.8.8.8 1.4 1.8 1.9 3h5.7a14.5 14.5 0 0 0-3.2-6.5c-1.4-1.7-3.3-3.1-5.7-3.9-2.3-.9-4.7-1.3-7.2-1.5l.2-6.2h-5l-.1 6.2c-1.9 0-3.8.2-5.7.6-1.8.4-3.5 1-5 1.9-1.5.9-2.7 2.2-3.6 3.7-.9 1.5-1.4 3.2-1.4 5.2 0 1.5.3 3 .8 4.3.5 1.3 1.4 2.4 2.4 3.3 1 1 2.3 1.7 3.7 2.3 1.4.6 3 1 4.7 1.3 1.7.3 3.6.5 5.4.6 1.9.1 3.7.3 5.4.5.8.1 1.5.3 2 .6.5.3.9.6 1.1 1.1.2.5.3 1 .3 1.7 0 .7-.3 1.3-.7 1.9-.4.6-1.1 1.1-1.8 1.6-1 1.1-5.2 1.1-5.2 1.1-2 .1-3.8-.3-5.5-.9-1.7-.7-3.2-1.6-4.2-2.6-1.1-1.1-1.9-2.5-2.3-4.1H21c.3 2.3 1.2 4.4 2.6 6.2 1.4 1.8 3.3 3.3 5.8 4.3 2.5 1 5 1.4 7.6 1.5l-.1 6.3h5l.1-6.3c2.1 0 4.1-.2 5.9-.7 1.8-.4 3.5-1.1 4.8-2.1z" fill="white"/>
                                        </svg>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="sb-aurora" />
                <div className="sb-fill-stream" />
            </div>

            <div className="sb-text-container">
                <div className="sb-text">
                    {isLoading ? (
                        <div className="sb-loading-flex">
                            <span className="spinner-small" />
                            <span>Processing...</span>
                        </div>
                    ) : isCompleted ? (
                        <span className="animate-pop">Released!</span>
                    ) : (
                        <span className="sb-label">{text}</span>
                    )}
                </div>
            </div>

            {/* Nostalgic Digital Scanlines Overlay */}
            <div className="sb-scanlines" />

            <div 
                className={`sb-handle ${isDragging ? 'dragging' : ''} ${isCompleted ? 'completed' : ''}`}
                onMouseDown={handleStart}
                onTouchStart={handleStart}
                ref={handleRef}
                style={{ 
                    transform: `translateX(${sliderPos}px)`,
                    background: color
                }}
            >
                <div className="sb-handle-icon">
                    {isCompleted ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    ) : (
                        <IconChevronRight size={24} color="white" />
                    )}
                </div>
            </div>
        </div>
    );
};
