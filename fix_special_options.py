import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. Add state
content = content.replace("const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);", "const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);\n    const [isSpecialOptionsModalOpen, setIsSpecialOptionsModalOpen] = useState(false);")


# 2. Replace the Special Options block on the main page
old_special_options_pattern = re.compile(r"                            <div className=\"co-section-title\" style=\{\{ marginTop: '16px' \}\}>9\. Special Options<\/div>\n                            <div style=\{\{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', background: 'rgba\(255,255,255,0\.03\)', borderRadius: '8px', border: '1px solid rgba\(255,255,255,0\.08\)' \}\}>.*?<\/div>\n                            <\/div>", re.DOTALL)

new_special_options_trigger = """                            <div className="co-section-title" style={{ marginTop: '16px' }}>9. Special Options</div>
                            <div 
                                onClick={() => { haptic('selection'); setIsSpecialOptionsModalOpen(true); }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⚙️</div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Advanced Settings</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>New traders only, Block dealers</div>
                                    </div>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '18px' }}>›</div>
                            </div>"""

if not old_special_options_pattern.search(content):
    print("Could not find the old special options block")
else:
    content = re.sub(old_special_options_pattern, new_special_options_trigger, content)

# 3. Add the Special Options modal right before the Exclude Dealers modal
modal_code = """            {/* Special Options Full Screen Modal */}
            {isSpecialOptionsModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 999998,
                    background: 'var(--bg-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <button onClick={() => setIsSpecialOptionsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '24px', lineHeight: 1 }}>‹</button>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Special Options</div>
                        <div style={{ width: '24px' }}></div>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {/* New Traders Only Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                            <div>
                                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>New Traders Only</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Only users with 0 completed trades can buy/sell</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}
                                style={{
                                    background: newTradersOnly ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                                    color: newTradersOnly ? '#000' : '#fff',
                                    border: 'none',
                                    padding: '6px 14px',
                                    borderRadius: '16px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {newTradersOnly ? 'ON' : 'OFF'}
                            </button>
                        </div>

                        {/* Exclude Specific Dealers */}
                        <div style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '12px' : '0' }}>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Block Specific Dealers</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Prevent specific users from taking this ad</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { haptic('selection'); setIsExcludeModalOpen(true); }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        background: 'rgba(255, 69, 58, 0.1)',
                                        border: '1px dashed rgba(255, 69, 58, 0.3)',
                                        color: '#ff453a',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add
                                </button>
                            </div>

                            {excludedDealerUsernames.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {excludedDealerUsernames.map(username => (
                                        <div
                                            key={username}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '6px 12px',
                                                background: 'rgba(255, 69, 58, 0.15)',
                                                border: '1px solid rgba(255, 69, 58, 0.3)',
                                                borderRadius: '100px',
                                                fontSize: '12px',
                                                color: '#ff453a'
                                            }}
                                        >
                                            @{username}
                                            <div 
                                                onClick={() => setExcludedDealerUsernames(prev => prev.filter(x => x !== username))}
                                                style={{ cursor: 'pointer', background: 'rgba(255,69,58,0.2)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}
                                            >
                                                ✕
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
"""

content = content.replace("{/* Exclude Dealers Full Screen Modal */}", modal_code + "\n            {/* Exclude Dealers Full Screen Modal */}")

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)
print("Applied special options modal changes")
