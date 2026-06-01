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

    useEffect(() => {
        if (!startTimeMs) return;
        const fetchInitial = async () => {
            try {
                // Fetch 1-second candles from Binance for the last 5 minutes
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
    }, [startTimeMs]); // Re-fetch when round changes

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

    const { pathD, areaPathD, minP, maxP, lastPoint, rocketAngle, yLabels, xLabels, chartColor, getX } = useMemo(() => {
        if (data.length === 0) return { pathD: '', areaPathD: '', minP: 0, maxP: 0, lastPoint: null, rocketAngle: 0, yLabels: [], xLabels: [], chartColor: '#00C2FF', getX: null };

        const width = 800;
        const height = 230; // Matches .pm-chart-wrap
        const paddingY = 40;
        const paddingX = 60; // Space for Y axis labels on the right

        let minPrice = Math.min(...data.map(d => d.price));
        let maxPrice = Math.max(...data.map(d => d.price));

        if (priceToBeat > 0) {
            minPrice = Math.min(minPrice, priceToBeat);
            maxPrice = Math.max(maxPrice, priceToBeat);
        }

        const range = maxPrice - minPrice || 10;
        minPrice -= range * 0.15;
        maxPrice += range * 0.15;

        // Smooth rolling window: 2 minutes past, 30 seconds future (moves much faster visually)
        const visibleMinTime = currentTime - 120000;
        const visibleMaxTime = currentTime + 30000;
        const timeRange = visibleMaxTime - visibleMinTime;
        const priceRange = maxPrice - minPrice;

        const getX = (t: number) => ((t - visibleMinTime) / timeRange) * (width - paddingX);
        const getY = (p: number) => height - paddingY - ((p - minPrice) / priceRange) * (height - paddingY * 1.5);

        let d = '';
        data.forEach((pt, i) => {
            const x = getX(pt.time);
            const y = getY(pt.price);
            if (i === 0) d += `M ${x},${y}`;
            else d += ` L ${x},${y}`;
        });

        let areaD = '';
        if (data.length > 0) {
            const firstX = getX(data[0].time);
            const lastX = getX(data[data.length - 1].time);
            areaD = `${d} L ${lastX},${height} L ${firstX},${height} Z`;
        }

        const lastPoint = data.length > 0 ? { x: getX(data[data.length - 1].time), y: getY(data[data.length - 1].price) } : null;
        const isCurrentlyUp = data.length > 0 && data[data.length - 1].price >= priceToBeat;
        const chartColor = isCurrentlyUp ? '#00C2FF' : '#FF4D4D';
        
        let rocketAngle = -45;
        if (data.length >= 2 && lastPoint) {
            const prev = data[data.length - 2];
            const pX = getX(prev.time);
            const pY = getY(prev.price);
            rocketAngle = Math.atan2(lastPoint.y - pY, lastPoint.x - pX) * (180 / Math.PI);
        }

        // Y Labels (4 steps)
        const yLabels = [];
        for (let i = 0; i <= 4; i++) {
            const p = minPrice + (priceRange * (i / 4));
            yLabels.push({ y: getY(p), text: `${(p / 1000).toFixed(1)}K` });
        }

        // X Labels (1 minute intervals aligned to clock)
        const xLabels = [];
        const firstMinute = Math.floor(visibleMinTime / 60000) * 60000;
        for (let t = firstMinute; t <= visibleMaxTime; t += 60000) {
            const dDate = new Date(t);
            const mins = dDate.getMinutes().toString().padStart(2, '0');
            const hrs = dDate.getHours().toString().padStart(2, '0');
            xLabels.push({ x: getX(t), text: `${hrs}:${mins}` });
        }

        return { pathD: d, areaPathD: areaD, minP: minPrice, maxP: maxPrice, lastPoint, rocketAngle, yLabels, xLabels, chartColor, getX };
    }, [data, startTimeMs, endTimeMs, priceToBeat, currentTime]);

    if (!startTimeMs || !endTimeMs) return <div style={{color: '#848e9c', padding: 20, fontSize: 12}}>Loading chart...</div>;

    const width = 800;
    const height = 230;
    const ptbY = priceToBeat > 0 && maxP > 0 ? height - 40 - ((priceToBeat - minP) / (maxP - minP)) * (height - 40 * 1.5) : -100;

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ backgroundColor: 'transparent' }}>
                <defs>
                    <linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={chartColor} />
                        <stop offset="100%" stopColor={chartColor} />
                    </linearGradient>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor={chartColor} stopOpacity="0.3" />
                        <stop offset="100%" stopColor={chartColor} stopOpacity="0.0" />
                    </linearGradient>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                {/* Grid Lines */}
                {yLabels.map((l, i) => (
                    <line key={`g-${i}`} x1="0" y1={l.y} x2={width - 60} y2={l.y} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                ))}

                {/* Y-Axis Labels */}
                {yLabels.map((l, i) => (
                    <text key={`y-${i}`} x={width - 50} y={l.y + 4} fill="#848e9c" fontSize="10" fontFamily="system-ui, sans-serif">
                        {l.text}
                    </text>
                ))}

                {/* X-Axis Labels */}
                {xLabels.map((l, i) => (
                    <text key={`x-${i}`} x={l.x} y={height - 10} textAnchor="middle" fill="#848e9c" fontSize="10" fontFamily="system-ui, sans-serif">
                        {l.text}
                    </text>
                ))}

                {/* Watermark */}
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

                {/* Price to Beat Line */}
                {priceToBeat > 0 && ptbY > 0 && (
                    <line 
                        x1="0" y1={ptbY} 
                        x2={width - 60} y2={ptbY} 
                        stroke="#848e9c" 
                        strokeWidth="1.5" 
                        strokeDasharray="6,6" 
                        opacity="0.5"
                    />
                )}

                {/* Round Start Marker */}
                {startTimeMs > 0 && getX && (
                    <line 
                        x1={getX(startTimeMs)} y1="0" 
                        x2={getX(startTimeMs)} y2={height - 30} 
                        stroke="rgba(255,255,255,0.2)" 
                        strokeWidth="2" 
                        strokeDasharray="4,4" 
                    />
                )}

                {/* Round End Marker */}
                {endTimeMs > 0 && getX && (
                    <line 
                        x1={getX(endTimeMs)} y1="0" 
                        x2={getX(endTimeMs)} y2={height - 30} 
                        stroke="rgba(255,100,100,0.4)" 
                        strokeWidth="2" 
                        strokeDasharray="4,4" 
                    />
                )}

                {/* Area Fill under the path */}
                {areaPathD && (
                    <path 
                        d={areaPathD} 
                        fill="url(#areaGradient)" 
                    />
                )}

                {/* Main Price Line */}
                {pathD && (
                    <path 
                        d={pathD} 
                        stroke="url(#neonGradient)" 
                        strokeWidth="2.5" 
                        fill="none" 
                        filter="url(#glow)"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}

                {/* Current Price Dot */}
                {lastPoint && (
                    <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
                        <circle cx="0" cy="0" r="4" fill={chartColor} />
                    </g>
                )}
            </svg>
        </div>
    );
}
