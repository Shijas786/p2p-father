import React, { useEffect, useState, useMemo } from 'react';

interface PredictChartProps {
    livePrice: number;
    priceToBeat: number;
    startTimeMs: number;
    endTimeMs: number;
}

interface Point {
    time: number;
    price: number;
}

export function PredictChart({ livePrice, priceToBeat, startTimeMs, endTimeMs }: PredictChartProps) {
    const [data, setData] = useState<Point[]>([]);
    const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

    useEffect(() => {
        if (!startTimeMs) return;
        const fetchInitial = async () => {
            try {
                const fetchStart = Date.now() - 300000;
                const url = `https://api.binance.com/api/v3/uiKlines?symbol=BTCUSDT&interval=1s&startTime=${fetchStart}&limit=300`;
                const res = await fetch(url);
                const json = await res.json();
                const points = json.map((k: any) => ({
                    time: k[0],
                    price: parseFloat(k[4])
                }));
                setData(points);
            } catch (e) {
                console.error("Failed to fetch chart history", e);
            }
        };
        fetchInitial();
    }, [startTimeMs]);

    const [currentTime, setCurrentTime] = useState(Date.now());
    useEffect(() => {
        let animationFrameId: number;
        const tick = () => {
            setCurrentTime(Date.now());
            animationFrameId = requestAnimationFrame(tick);
        };
        animationFrameId = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    useEffect(() => {
        if (livePrice > 0) {
            setData(prev => {
                const now = Date.now();
                if (prev.length > 0 && now - prev[prev.length - 1].time < 1000) {
                    const copy = [...prev];
                    copy[copy.length - 1] = { time: now, price: livePrice };
                    return copy;
                }
                return [...prev, { time: now, price: livePrice }];
            });
        }
    }, [livePrice]);

    const { pathD, areaPathD, minP, maxP, lastPoint, yLabels, xLabels, getX, getY } = useMemo(() => {
        if (data.length === 0) return { pathD: '', areaPathD: '', minP: 0, maxP: 0, lastPoint: null, yLabels: [], xLabels: [], getX: null, getY: null };

        const width = 800;
        const height = 230;
        const paddingY = 40;
        const paddingX = 60;

        let minPrice = Math.min(...data.map(d => d.price));
        let maxPrice = Math.max(...data.map(d => d.price));

        if (priceToBeat > 0) {
            minPrice = Math.min(minPrice, priceToBeat);
            maxPrice = Math.max(maxPrice, priceToBeat);
        }

        const range = maxPrice - minPrice || 10;
        minPrice -= range * 0.15;
        maxPrice += range * 0.15;

        const visibleMinTime = currentTime - 120000;
        const visibleMaxTime = currentTime + 30000;
        const timeRange = visibleMaxTime - visibleMinTime;
        const priceRange = maxPrice - minPrice;

        const getX = (t: number) => ((t - visibleMinTime) / timeRange) * (width - paddingX);
        const getY = (p: number) => height - paddingY - ((p - minPrice) / priceRange) * (height - paddingY * 1.5);

        let d = '';
        if (data.length > 0) {
            d += `M ${getX(data[0].time)},${getY(data[0].price)}`;
            for (let i = 1; i < data.length; i++) {
                const prev = data[i - 1];
                const curr = data[i];
                const prevX = getX(prev.time);
                const prevY = getY(prev.price);
                const currX = getX(curr.time);
                const currY = getY(curr.price);
                
                const cp1X = prevX + (currX - prevX) / 2;
                const cp1Y = prevY;
                const cp2X = currX - (currX - prevX) / 2;
                const cp2Y = currY;
                
                d += ` C ${cp1X},${cp1Y} ${cp2X},${cp2Y} ${currX},${currY}`;
            }
        }

        let areaD = '';
        if (data.length > 0) {
            const firstX = getX(data[0].time);
            const lastX = getX(data[data.length - 1].time);
            areaD = `${d} L ${lastX},${height} L ${firstX},${height} Z`;
        }

        const lastPoint = data.length > 0 ? { x: getX(data[data.length - 1].time), y: getY(data[data.length - 1].price) } : null;

        const yLabels = [];
        for (let i = 0; i <= 4; i++) {
            const p = minPrice + (priceRange * (i / 4));
            yLabels.push({ y: getY(p), text: `${(p / 1000).toFixed(1)}K` });
        }

        const xLabels = [];
        const firstMinute = Math.floor(visibleMinTime / 60000) * 60000;
        for (let t = firstMinute; t <= visibleMaxTime; t += 60000) {
            const dDate = new Date(t);
            const mins = dDate.getMinutes().toString().padStart(2, '0');
            const hrs = dDate.getHours().toString().padStart(2, '0');
            xLabels.push({ x: getX(t), text: `${hrs}:${mins}` });
        }

        return { pathD: d, areaPathD: areaD, minP: minPrice, maxP: maxPrice, lastPoint, yLabels, xLabels, getX, getY };
    }, [data, startTimeMs, endTimeMs, priceToBeat, currentTime]);

    if (!startTimeMs || !endTimeMs) return <div style={{color: '#848e9c', padding: 20, fontSize: 12}}>Loading chart...</div>;

    const width = 800;
    const height = 230;
    const ptbY = priceToBeat > 0 && maxP > 0 ? height - 40 - ((priceToBeat - minP) / (maxP - minP)) * (height - 40 * 1.5) : -100;
    const ptbPercent = Math.max(0, Math.min(100, (ptbY / height) * 100));

    const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!getX || data.length === 0) return;
        const rect = (e.currentTarget as any).getBoundingClientRect();
        let clientX = 0;
        if ('touches' in e) clientX = e.touches[0].clientX;
        else clientX = (e as React.MouseEvent).clientX;

        const svgX = ((clientX - rect.left) / rect.width) * width;
        
        let closest = data[0];
        let minDist = Infinity;
        for (const pt of data) {
            const x = getX(pt.time);
            const dist = Math.abs(x - svgX);
            if (dist < minDist) { minDist = dist; closest = pt; }
        }
        setHoverPoint(closest);
    };

    return (
        <div 
            style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
            onMouseMove={handleMouseMove}
            onTouchMove={handleMouseMove}
            onMouseLeave={() => setHoverPoint(null)}
            onTouchEnd={() => setHoverPoint(null)}
        >
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ backgroundColor: 'transparent' }}>
                <defs>
                    <linearGradient id="neonGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#00C2FF" />
                        <stop offset={`${ptbPercent}%`} stopColor="#00C2FF" />
                        <stop offset={`${ptbPercent}%`} stopColor="#FF4D4D" />
                        <stop offset="100%" stopColor="#FF4D4D" />
                    </linearGradient>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#00C2FF" stopOpacity="0.4" />
                        <stop offset={`${ptbPercent}%`} stopColor="#00C2FF" stopOpacity="0.1" />
                        <stop offset={`${ptbPercent}%`} stopColor="#FF4D4D" stopOpacity="0.1" />
                        <stop offset="100%" stopColor="#FF4D4D" stopOpacity="0.4" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                {yLabels.map((l, i) => (
                    <line key={`g-${i}`} x1="0" y1={l.y} x2={width - 60} y2={l.y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                ))}

                {yLabels.map((l, i) => (
                    <text key={`y-${i}`} x={width - 50} y={l.y + 4} fill="#848e9c" fontSize="10" fontFamily="system-ui, sans-serif">
                        {l.text}
                    </text>
                ))}

                {xLabels.map((l, i) => (
                    <text key={`x-${i}`} x={l.x} y={height - 10} textAnchor="middle" fill="#848e9c" fontSize="10" fontFamily="system-ui, sans-serif">
                        {l.text}
                    </text>
                ))}

                <text 
                    x={(width - 60) / 2} 
                    y={height / 2 + 30} 
                    textAnchor="middle" 
                    fill="transparent" 
                    stroke="rgba(255,255,255,0.04)" 
                    strokeWidth="2.5" 
                    fontSize="110" 
                    fontWeight="900" 
                    fontFamily="system-ui, -apple-system, sans-serif"
                    transform={`rotate(-12 ${(width - 60) / 2} ${height / 2})`}
                    style={{ userSelect: 'none' }}
                >
                    P2P FATHER
                </text>

                {priceToBeat > 0 && ptbY > 0 && (
                    <line 
                        x1="0" y1={ptbY} 
                        x2={width - 60} y2={ptbY} 
                        stroke="#fff" 
                        strokeWidth="1.5" 
                        strokeDasharray="6,6" 
                        opacity="0.6"
                    />
                )}

                {startTimeMs > 0 && getX && (
                    <line x1={getX(startTimeMs)} y1="0" x2={getX(startTimeMs)} y2={height - 30} stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
                )}

                {endTimeMs > 0 && getX && (
                    <line x1={getX(endTimeMs)} y1="0" x2={getX(endTimeMs)} y2={height - 30} stroke="rgba(255,100,100,0.4)" strokeWidth="2" strokeDasharray="4,4" />
                )}

                {areaPathD && <path d={areaPathD} fill="url(#areaGradient)" />}

                {pathD && <path d={pathD} stroke="url(#neonGradient)" strokeWidth="2.5" fill="none" filter="url(#glow)" strokeLinejoin="round" strokeLinecap="round" />}

                {lastPoint && (
                    <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
                        <circle cx="0" cy="0" r="14" fill={lastPoint.y < ptbY ? '#00C2FF' : '#FF4D4D'} opacity="0.3" style={{ animation: 'pulseDot 2s infinite ease-out' }} />
                        <circle cx="0" cy="0" r="5" fill={lastPoint.y < ptbY ? '#00C2FF' : '#FF4D4D'} />
                        <circle cx="0" cy="0" r="2.5" fill="#fff" />
                    </g>
                )}

                {hoverPoint && getX && getY && (
                    <g>
                        <line x1={getX(hoverPoint.time)} y1="0" x2={getX(hoverPoint.time)} y2={height} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4,4" />
                        <line x1="0" y1={getY(hoverPoint.price)} x2={width - 60} y2={getY(hoverPoint.price)} stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeDasharray="4,4" />
                        <circle cx={getX(hoverPoint.time)} cy={getY(hoverPoint.price)} r="4" fill="#fff" stroke={getY(hoverPoint.price) < ptbY ? '#00C2FF' : '#FF4D4D'} strokeWidth="2" />
                        <rect x={Math.max(10, Math.min(getX(hoverPoint.time) - 40, width - 140))} y={Math.max(10, getY(hoverPoint.price) - 50)} width="80" height="36" rx="6" fill="rgba(15, 20, 30, 0.95)" stroke="rgba(255,255,255,0.2)" />
                        <text x={Math.max(10, Math.min(getX(hoverPoint.time) - 40, width - 140)) + 40} y={Math.max(10, getY(hoverPoint.price) - 50) + 16} fill="#fff" fontSize="13" fontWeight="bold" textAnchor="middle" fontFamily="system-ui, sans-serif">${hoverPoint.price.toFixed(2)}</text>
                        <text x={Math.max(10, Math.min(getX(hoverPoint.time) - 40, width - 140)) + 40} y={Math.max(10, getY(hoverPoint.price) - 50) + 28} fill="#a0a0a0" fontSize="10" textAnchor="middle" fontFamily="system-ui, sans-serif">{new Date(hoverPoint.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</text>
                    </g>
                )}
            </svg>
        </div>
    );
}
