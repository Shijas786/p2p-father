import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. Imports
content = content.replace("import './CreateOrder.css';", "import './CreateOrder.css';\nimport './CreateOrderThemes.css';\n\nconst SKINS = ['cyberpunk', 'ios', 'neobrutalism', 'neumorphism', 'minimal', 'fintech', 'candy', 'glassmorphism', 'terminal'];\nconst LAYOUTS = ['standard', 'accordion', 'compact', 'wizard', 'floating', 'grid'];")

# 2. States & New Traders Only
state_repl = """    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [newTradersOnly, setNewTradersOnly] = useState(false);
    const [themeIndex, setThemeIndex] = useState(3); // Start with wizard (index 3 is wizard + default skin)
    const layout = LAYOUTS[themeIndex % LAYOUTS.length];
    const skin = SKINS[Math.floor(themeIndex / LAYOUTS.length) % SKINS.length];
    
    // Layout helpers
    const isWizard = layout === 'wizard';
    const showStep1 = !isWizard || step === 1;
    const showStep2 = !isWizard || step === 2;
    const showStep3 = !isWizard || step === 3;
    
    // Accordion state
    const [expandedAcc, setExpandedAcc] = useState(1);
"""
content = content.replace("    const [isDropdownOpen, setIsDropdownOpen] = useState(false);", state_repl)

# Update API call payload
content = content.replace("expires_in: expiryMinutes,", "expires_in: expiryMinutes,\n                new_traders_only: newTradersOnly,")

# Add New Traders Only UI
ui_repl = """                            <div className="text-[10px] text-muted mb-2">
                                Ad will automatically cancel after this time.
                            </div>

                            <div className="co-section-title" style={{ marginTop: '16px' }}>10. Special Options</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>New Traders Only</div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only users with 0 completed trades can buy/sell</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}
                                    style={{
                                        background: newTradersOnly ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                                        color: newTradersOnly ? '#000' : '#fff',
                                        border: 'none',
                                        padding: '6px 12px',
                                        borderRadius: '16px',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {newTradersOnly ? 'ON' : 'OFF'}
                                </button>
                            </div>
                        </div>"""
content = content.replace("""                            <div className="text-[10px] text-muted mb-2">
                                Ad will automatically cancel after this time.
                            </div>
                        </div>""", ui_repl)

# 3. Root Div
content = content.replace('<div className="page animate-in">', '<div className={`page animate-in theme-sandbox-wrapper layout-${layout} skin-${skin}`}>')

# 4. Step rendering logic
content = content.replace('{step === 1 && (', '{showStep1 && (')
content = content.replace('{step === 2 && (', '{showStep2 && (')
content = content.replace('{step === 3 && (', '{showStep3 && (')

# 5. Hide wizard buttons
content = content.replace('<div className="mt-4">\n                            <button\n                                className="btn btn-primary btn-block btn-lg"\n                                onClick={() => setStep(2)}', '{isWizard && (\n                        <div className="mt-4">\n                            <button\n                                className="btn btn-primary btn-block btn-lg"\n                                onClick={() => setStep(2)}')
# Close the added conditional for step 1
content = content.replace('Next Step ➡️\n                            </button>\n                        </div>\n                    </div>', 'Next Step ➡️\n                            </button>\n                        </div>\n                        )}\n                    </div>')

# Step 2 buttons
content = content.replace('<div className="flex gap-2 mt-4">\n                            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>', '{isWizard && (\n                        <div className="flex gap-2 mt-4">\n                            <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>')
content = content.replace('Next Step ➡️\n                            </button>\n                        </div>\n                    </div>\n                )}', 'Next Step ➡️\n                            </button>\n                        </div>\n                        )}\n                    </div>\n                )}')

# Step 3 Back button
# Wait, Step 3 has submit button, we still need the submit button!
# The submit button is: <button className={`btn-publish flex-[2] ... onClick={() => { ...
# So for Step 3, we only want to hide the Back button if not wizard.
content = content.replace('<button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>', '{isWizard && <button className="btn btn-secondary flex-1" onClick={() => setStep(1)}>⬅️ Back</button>}')

# 6. Accordion functionality
# Only replacing the class of the parent elements, keeping internals identical
content = content.replace('<div className="co-section card-glass">', '<div className={`co-section card-glass ${expandedAcc === 1 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(1)}><div className="co-section-content">')
content = content.replace('<div className="co-section-title">1. Trade Type</div>', '</div><div className="co-section-title">1. Trade Type</div><div className="co-section-content">')

content = content.replace('<div className="co-section card-glass mt-4">', '<div className={`co-section card-glass mt-4 ${expandedAcc === 2 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(2)}><div className="co-section-content">')
content = content.replace('<div className="co-section-title">4. Price Rate</div>', '</div><div className="co-section-title">4. Price Rate</div><div className="co-section-content">')

# Wait, the third section is '6. Payment Methods' inside step 3
content = content.replace('<div className="co-section card-glass mt-4">\n                            <div className="co-section-title">6. Payment Methods</div>', '<div className={`co-section card-glass mt-4 ${expandedAcc === 3 ? \'expanded\' : \'\'}`} onClick={() => layout === \'accordion\' && setExpandedAcc(3)}>\n                            <div className="co-section-title">6. Payment Methods</div><div className="co-section-content">')

# We need to add closing divs to the end of these sections.
# Step 1 end is before the wizard buttons:
content = content.replace('</div>\n\n                        {isWizard && (', '</div></div>\n\n                        {isWizard && (')

# Step 2 end:
content = content.replace('</div>\n\n                        {isWizard && (\n                        <div className="flex gap-2 mt-4">', '</div></div>\n\n                        {isWizard && (\n                        <div className="flex gap-2 mt-4">')

# Step 3 end before Summary & Vault:
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
