with open('miniapp/src/pages/Profile.tsx', 'r') as f:
    content = f.read()

# Add states
state_injection = """
    const [themeHue, setThemeHue] = useState(() => {
        const stored = localStorage.getItem('themeHue');
        return stored ? parseInt(stored) : 265;
    });

    const [mBottom, setMBottom] = useState(-24);
    const [mRight, setMRight] = useState(10);
    const [mHeight, setMHeight] = useState(110);
"""

content = content.replace("""    const [themeHue, setThemeHue] = useState(() => {
        const stored = localStorage.getItem('themeHue');
        return stored ? parseInt(stored) : 265;
    });""", state_injection)

# Replace Mascot IMG
old_img = """                    {/* Mascot */}
                    <img 
                        src={mascotImg} 
                        alt="Mascot" 
                        style={{ 
                            position: 'absolute', 
                            bottom: '-24px', /* Aligns perfectly with 24px padding-bottom of container */
                            right: '10px', 
                            height: '110px', 
                            objectFit: 'contain', 
                            filter: `drop-shadow(0px 10px 15px rgba(0,0,0,0.5))`
                        }} 
                    />"""

new_img = """                    {/* Mascot */}
                    <img 
                        src={mascotImg} 
                        alt="Mascot" 
                        style={{ 
                            position: 'absolute', 
                            bottom: `${mBottom}px`, 
                            right: `${mRight}px`, 
                            height: `${mHeight}px`, 
                            objectFit: 'contain', 
                            filter: `drop-shadow(0px 10px 15px rgba(0,0,0,0.5))`
                        }} 
                    />"""
content = content.replace(old_img, new_img)

# Add controls at the very bottom
controls_injection = """
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', padding: '10px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '5px', color: '#fff', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>Mascot Debugger</b>
                    <button onClick={() => {
                        const code = `bottom: '${mBottom}px', right: '${mRight}px', height: '${mHeight}px'`;
                        navigator.clipboard.writeText(code);
                        alert('Copied: ' + code);
                    }} style={{ background: '#333', color: '#fff', border: '1px solid #555', padding: '4px 8px', borderRadius: '4px' }}>Copy Code</button>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label>Bottom ({mBottom}px): <input type="range" min="-100" max="100" value={mBottom} onChange={e => setMBottom(parseInt(e.target.value))} /></label>
                    <button onClick={() => setMBottom(m => m - 1)}>-</button><button onClick={() => setMBottom(m => m + 1)}>+</button>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label>Right ({mRight}px): <input type="range" min="-100" max="100" value={mRight} onChange={e => setMRight(parseInt(e.target.value))} /></label>
                    <button onClick={() => setMRight(m => m - 1)}>-</button><button onClick={() => setMRight(m => m + 1)}>+</button>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label>Height ({mHeight}px): <input type="range" min="50" max="300" value={mHeight} onChange={e => setMHeight(parseInt(e.target.value))} /></label>
                    <button onClick={() => setMHeight(m => m - 1)}>-</button><button onClick={() => setMHeight(m => m + 1)}>+</button>
                </div>
            </div>
        </div>
"""
content = content.replace("        </div>", controls_injection, 1)

with open('miniapp/src/pages/Profile.tsx', 'w') as f:
    f.write(content)
print("Added mascot debugger")
