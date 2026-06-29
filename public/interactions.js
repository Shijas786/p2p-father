function wrapTextNodes(node) {
    if (node.nodeType === 3) { // Text node
        const text = node.nodeValue;
        // Don't process empty text nodes
        if (!text.replace(/\s/g, '').length) return;
        
        const fragment = document.createDocumentFragment();
        text.split('').forEach(char => {
            if (char === ' ' || char === '\n') {
                fragment.appendChild(document.createTextNode(char));
            } else {
                const span = document.createElement('span');
                span.textContent = char;
                span.className = 'pressure-char';
                span.style.display = 'inline-block';
                // Fast transition for fluid interaction
                span.style.transition = 'transform 0.15s cubic-bezier(0.2, 0, 0.2, 1), font-weight 0.15s, color 0.15s';
                // Transform origin bottom so letters grow upwards
                span.style.transformOrigin = 'bottom center';
                fragment.appendChild(span);
            }
        });
        node.parentNode.replaceChild(fragment, node);
    } else if (node.nodeType === 1) { // Element node
        // Ignore script tags or already wrapped chars
        if (node.tagName === 'SCRIPT' || node.classList.contains('pressure-char')) return;
        // Convert childNodes to array to safely iterate while modifying DOM
        Array.from(node.childNodes).forEach(wrapTextNodes);
    }
}

function initTextPressure() {
    const containers = document.querySelectorAll('[data-text-pressure]');
    
    containers.forEach(container => {
        // Wrap text nodes in spans
        wrapTextNodes(container);
    });

    const chars = document.querySelectorAll('.pressure-char');
    if (!chars.length) return;

    let rafId = null;
    let targetX = -1000;
    let targetY = -1000;

    // Track mouse position globally
    document.addEventListener('mousemove', (e) => {
        targetX = e.clientX;
        targetY = e.clientY;
        
        if (!rafId) {
            rafId = requestAnimationFrame(updateChars);
        }
    });

    // Reset when mouse leaves window
    document.addEventListener('mouseleave', () => {
        targetX = -1000;
        targetY = -1000;
        if (!rafId) rafId = requestAnimationFrame(updateChars);
    });

    function updateChars() {
        let isActive = false;

        chars.forEach(span => {
            const rect = span.getBoundingClientRect();
            // Calculate center of character
            const spanX = rect.left + rect.width / 2;
            const spanY = rect.top + rect.height / 2;
            
            // Calculate distance to mouse
            const dist = Math.sqrt(Math.pow(targetX - spanX, 2) + Math.pow(targetY - spanY, 2));
            
            const maxDist = 120; // Proximity radius

            if (dist < maxDist) {
                isActive = true;
                const intensity = 1 - (dist / maxDist); // 0 to 1
                
                // Scale up to 1.3x and slightly shift Y
                const scale = 1 + (0.35 * Math.pow(intensity, 1.5));
                const translateY = -8 * Math.pow(intensity, 1.5);
                
                span.style.transform = `scale(${scale}, ${1 + 0.2*intensity}) translateY(${translateY}px)`;
                
                // Mix in theme color based on proximity (#10b981)
                span.style.color = `color-mix(in srgb, #10b981 ${intensity * 80}%, inherit)`;
            } else {
                span.style.transform = 'scale(1, 1) translateY(0)';
                span.style.color = '';
            }
        });

        if (isActive) {
            rafId = requestAnimationFrame(updateChars);
        } else {
            rafId = null;
        }
    }
}

function initTilt() {
    const elements = document.querySelectorAll('.tilt');
    
    elements.forEach(el => {
        // Set initial transition
        el.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        el.style.willChange = 'transform';
        
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            
            // Calculate mouse position relative to element center
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Calculate rotation degrees (max 10 degrees)
            const rotateX = ((y - centerY) / centerY) * -10; 
            const rotateY = ((x - centerX) / centerX) * 10;
            
            // Apply 3D transform with slight scale up
            el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });
        
        el.addEventListener('mouseleave', () => {
            // Reset transform
            el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    });
}

// Initialize when DOM is ready
function runInit() {
    setTimeout(() => {
        initTextPressure();
        initTilt();
    }, 100);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
