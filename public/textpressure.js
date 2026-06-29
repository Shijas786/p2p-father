const dist = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
};

const getAttr = (distance, maxDist, minVal, maxVal) => {
    const val = maxVal - Math.abs((maxVal * distance) / maxDist);
    return Math.max(minVal, val + minVal);
};

export default function initTextPressure(container, options = {}) {
    const {
        text = 'Compressa',
        fontFamily = 'Roboto Flex',
        fontUrl = 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wdth,wght@8..144,25..151,100..1000&display=swap',
        width = true,
        weight = true,
        italic = true,
        alpha = false,
        flex = true,
        stroke = false,
        scale = false,
        textColor = '#FFFFFF',
        strokeColor = '#FF0000',
        minFontSize = 24
    } = options;

    if (!document.getElementById('text-pressure-font')) {
        const style = document.createElement('style');
        style.id = 'text-pressure-font';
        style.innerHTML = `
            @import url('${fontUrl}');
            .tp-flex { display: flex; justify-content: space-between; }
            .tp-stroke span { position: relative; color: ${textColor}; }
            .tp-stroke span::after {
                content: attr(data-char);
                position: absolute;
                left: 0; top: 0;
                color: transparent;
                z-index: -1;
                -webkit-text-stroke-width: 3px;
                -webkit-text-stroke-color: ${strokeColor};
            }
        `;
        document.head.appendChild(style);
    }

    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.background = 'transparent';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';
    container.innerHTML = ''; // Clear previous

    const h1 = document.createElement('h1');
    h1.style.fontFamily = fontFamily;
    h1.style.textTransform = 'uppercase';
    h1.style.margin = '0';
    h1.style.textAlign = 'center';
    h1.style.userSelect = 'none';
    h1.style.whiteSpace = 'nowrap';
    h1.style.fontWeight = '100';
    h1.style.width = '100%';
    h1.style.color = textColor;
    h1.style.transformOrigin = 'center top';

    const classes = ['text-pressure-title'];
    if (flex) classes.push('tp-flex');
    if (stroke) classes.push('tp-stroke');
    h1.className = classes.join(' ');

    const chars = text.split('');
    const spans = [];
    chars.forEach(char => {
        const span = document.createElement('span');
        span.setAttribute('data-char', char);
        span.style.display = 'inline-block';
        if (!stroke) span.style.color = textColor;
        span.textContent = char;
        spans.push(span);
        h1.appendChild(span);
    });

    container.appendChild(h1);

    const mouse = { x: 0, y: 0 };
    const cursor = { x: 0, y: 0 };

    const handleMouseMove = e => {
        cursor.x = e.clientX;
        cursor.y = e.clientY;
    };
    const handleTouchMove = e => {
        cursor.x = e.touches[0].clientX;
        cursor.y = e.touches[0].clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });

    let rafId;
    const animate = () => {
        mouse.x += (cursor.x - mouse.x) / 15;
        mouse.y += (cursor.y - mouse.y) / 15;

        const titleRect = h1.getBoundingClientRect();
        const maxDist = titleRect.width / 2;

        spans.forEach(span => {
            const rect = span.getBoundingClientRect();
            const charCenter = {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2
            };

            const d = dist(mouse, charCenter);

            const wdth = width ? Math.floor(getAttr(d, maxDist, 5, 200)) : 100;
            const wght = weight ? Math.floor(getAttr(d, maxDist, 100, 900)) : 400;
            const italVal = italic ? getAttr(d, maxDist, 0, 1).toFixed(2) : 0;
            const alphaVal = alpha ? getAttr(d, maxDist, 0, 1).toFixed(2) : 1;

            const newFontVariationSettings = `'wght' ${wght}, 'wdth' ${wdth}, 'ital' ${italVal}`;

            if (span.style.fontVariationSettings !== newFontVariationSettings) {
                span.style.fontVariationSettings = newFontVariationSettings;
            }
            if (alpha && span.style.opacity !== alphaVal) {
                span.style.opacity = alphaVal;
            }
        });

        rafId = requestAnimationFrame(animate);
    };

    let debounceTimeout;
    const setSize = () => {
        const { width: containerW, height: containerH } = container.getBoundingClientRect();
        let newFontSize = containerW / (chars.length / 2);
        newFontSize = Math.max(newFontSize, minFontSize);

        h1.style.fontSize = `${newFontSize}px`;
        h1.style.transform = `scale(1, 1)`;
        h1.style.lineHeight = '1';

        requestAnimationFrame(() => {
            const textRect = h1.getBoundingClientRect();
            if (scale && textRect.height > 0) {
                const yRatio = containerH / textRect.height;
                h1.style.transform = `scale(1, ${yRatio})`;
                h1.style.lineHeight = `${yRatio}`;
            }
        });
    };

    const handleResize = () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(setSize, 100);
    };

    window.addEventListener('resize', handleResize);

    // Initial setup
    const rect = container.getBoundingClientRect();
    mouse.x = rect.left + rect.width / 2;
    mouse.y = rect.top + rect.height / 2;
    cursor.x = mouse.x;
    cursor.y = mouse.y;

    setSize();
    animate();

    return {
        destroy: () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(rafId);
            container.innerHTML = '';
        }
    };
}

function runInit() {
    const containers = document.querySelectorAll('.reactbits-text-pressure');
    containers.forEach(container => {
        const text = container.getAttribute('data-text') || 'HELLO';
        const color = container.getAttribute('data-color') || '#000000';
        initTextPressure(container, {
            text: text,
            textColor: color,
            flex: true,
            alpha: false,
            stroke: false,
            width: true,
            weight: true,
            italic: true,
            minFontSize: 36
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
