import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace("import './CreateOrder.css';", "import './CreateOrder.css';\nimport './CreateOrderThemes.css';\n\nconst SKINS = ['cyberpunk', 'ios', 'neobrutalism', 'neumorphism', 'minimal', 'fintech', 'candy', 'glassmorphism', 'terminal'];\nconst LAYOUTS = ['standard', 'accordion', 'compact', 'wizard', 'floating', 'grid'];")

# 2. States
content = content.replace("const [newTradersOnly, setNewTradersOnly] = useState(false);", "const [newTradersOnly, setNewTradersOnly] = useState(false);\n    const [themeIndex, setThemeIndex] = useState(0);\n    const layout = LAYOUTS[themeIndex % LAYOUTS.length];\n    const skin = SKINS[Math.floor(themeIndex / LAYOUTS.length) % SKINS.length];\n    const [expandedAcc, setExpandedAcc] = useState(1);")

# 3. Root Div
content = content.replace('<div className="page animate-in">', '<div className={`page animate-in theme-sandbox-wrapper layout-${layout} skin-${skin}`}>')

# 4. Step rendering logic
content = content.replace('{step === 1 && (', '{(step === 1 || layout !== \'wizard\') && (')
content = content.replace('{step === 2 && (', '{(step === 2 || layout !== \'wizard\') && (')
content = content.replace('{step === 3 && (', '{(step === 3 || layout !== \'wizard\') && (')

# 5. Hide wizard buttons
content = content.replace('<div className="mt-4">\n                            <button\n                                className="btn btn-primary btn-block btn-lg"\n                                onClick={() => setStep(2)}', '{layout === \'wizard\' && (\n                        <div className="mt-4">\n                            <button\n                                className="btn btn-primary btn-block btn-lg"\n                                onClick={() => setStep(2)}')
# Close the added conditional for step 1
content = content.replace('Next Step ➡️\n                            </button>\n                        </div>', 'Next Step ➡️\n                            </button>\n                        </div>\n                        )}')

# Step 2 buttons
content = content.replace('<div className="flex gap-2 mt-4">\n                            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>', '{layout === \'wizard\' && (\n                        <div className="flex gap-2 mt-4">\n                            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>')
content = content.replace('Next Step ➡️\n                            </button>\n                        </div>\n                    </div>\n                )}', 'Next Step ➡️\n                            </button>\n                        </div>\n                        )}\n                    </div>\n                )}')

# Step 3 Back button
# Wait, Step 3 has submit button, we still need the submit button!
# The submit button is: <button className={`btn-publish flex-[2] ... onClick={() => { ...
# So for Step 3, we only want to hide the Back button if not wizard.
content = content.replace('<button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>', '{layout === \'wizard\' && <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>}')

# 6. Accordion toggle classes
content = content.replace('<div className="co-section card-glass">\n                            <div className="co-section-title">1. Trade Type</div>', '<div className={`co-section card-glass ${expandedAcc === 1 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(1)}>\n                            <div className="co-section-title">1. Trade Type</div><div className="co-section-content">')
content = content.replace('<div className="co-section card-glass mt-4">\n                            <div className="co-section-title">4. Price Rate</div>', '</div></div>\n                        <div className={`co-section card-glass mt-4 ${expandedAcc === 2 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(2)}>\n                            <div className="co-section-title">4. Price Rate</div><div className="co-section-content">')
content = content.replace('<div className="co-section card-glass mt-4">\n                            <div className="co-section-title">6. Payment Methods</div>', '</div></div>\n                        <div className={`co-section card-glass mt-4 ${expandedAcc === 3 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(3)}>\n                            <div className="co-section-title">6. Payment Methods</div><div className="co-section-content">')

# Close the last co-section-content in step 3 before the summary
content = content.replace('</div>\n\n                        {/* Summary & Vault */}', '</div></div>\n\n                        {/* Summary & Vault */}')

# 7. Add Sandbox Controls
sandbox_ui = """
            {/* Sandbox UI Controls */}
            <div className="theme-sandbox-controls">
                <button className="theme-sandbox-btn" onClick={() => setThemeIndex(i => Math.max(0, i - 1))}>⬅️ Prev</button>
                <div className="theme-sandbox-label">
                    Design {themeIndex + 1}/54<br/>
                    <span style={{ fontSize: '9px', fontWeight: 'normal' }}>{layout.toUpperCase()} + {skin.toUpperCase()}</span>
                </div>
                <button className="theme-sandbox-btn" onClick={() => setThemeIndex(i => Math.min(53, i + 1))}>Next ➡️</button>
            </div>
        </div>
    );
}
"""
content = content.replace('</div>\n    );\n}', sandbox_ui)

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)

print("Modifications complete.")
