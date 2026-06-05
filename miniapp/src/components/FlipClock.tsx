import React, { useEffect, useState } from 'react';
import './FlipClock.css';

interface FlipDigitProps {
    value: string;
}

export function FlipDigit({ value }: FlipDigitProps) {
    const [current, setCurrent] = useState(value);
    const [next, setNext] = useState(value);
    const [isFlipping, setIsFlipping] = useState(false);

    useEffect(() => {
        if (value !== current) {
            setNext(value);
            setIsFlipping(true);
            const timeout = setTimeout(() => {
                setCurrent(value);
                setIsFlipping(false);
            }, 300); // 300ms flip animation
            return () => clearTimeout(timeout);
        }
    }, [value, current]);

    return (
        <div className={`pm-flip-digit ${isFlipping ? 'flipping' : ''}`}>
            <div className="pm-flip-top">{next}</div>
            <div className="pm-flip-bottom">{current}</div>
            <div className="pm-flip-fold pm-flip-fold-top">{current}</div>
            <div className="pm-flip-fold pm-flip-fold-bottom">{next}</div>
        </div>
    );
}

interface FlipClockProps {
    mins: string;
    secs: string;
}

export function FlipClock({ mins, secs }: FlipClockProps) {
    return (
        <div className="pm-flip-clock-wrapper">
            <div className="pm-flip-unit">
                <FlipDigit value={mins[0]} />
                <FlipDigit value={mins[1]} />
                <span className="pm-flip-label">MINS</span>
            </div>
            <div className="pm-flip-colon">:</div>
            <div className="pm-flip-unit">
                <FlipDigit value={secs[0]} />
                <FlipDigit value={secs[1]} />
                <span className="pm-flip-label">SECS</span>
            </div>
        </div>
    );
}
