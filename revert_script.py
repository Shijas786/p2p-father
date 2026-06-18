import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# Add state
content = content.replace("const [isDropdownOpen, setIsDropdownOpen] = useState(false);", "const [isDropdownOpen, setIsDropdownOpen] = useState(false);\n    const [newTradersOnly, setNewTradersOnly] = useState(false);")

# Update API payload
content = content.replace("expires_in: expiryMinutes,", "expires_in: expiryMinutes,\n                new_traders_only: newTradersOnly,")

# Add UI toggle
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

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)

print("Reverted to original UI and restored New Traders Only.")
