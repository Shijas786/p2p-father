import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. Change state name
content = content.replace("const [isSpecialOptionsModalOpen, setIsSpecialOptionsModalOpen] = useState(false);", "const [isAdvancedSettingsExpanded, setIsAdvancedSettingsExpanded] = useState(false);")

# 2. Replace the Special Options block on the main page AND the modal
# We will match from `9. Special Options` to the end of the `isSpecialOptionsModalOpen` block

main_block_pattern = re.compile(r"                            <div className=\"co-section-title\" style=\{\{ marginTop: '16px' \}\}>9\. Special Options<\/div>\n                            <div \n                                onClick=\{\(\) => \{ haptic\('selection'\); setIsSpecialOptionsModalOpen\(true\); \}\}\n                                style=\{\{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 12px', background: 'rgba\(255,255,255,0\.03\)', borderRadius: '8px', border: '1px solid rgba\(255,255,255,0\.08\)', cursor: 'pointer' \}\}\n                            >\n                                <div style=\{\{ display: 'flex', alignItems: 'center', gap: '12px' \}\}>\n                                    <div style=\{\{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba\(255,255,255,0\.05\)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' \}\}>⚙️<\/div>\n                                    <div>\n                                        <div style=\{\{ fontSize: '14px', fontWeight: 'bold' \}\}>Advanced Settings<\/div>\n                                        <div style=\{\{ fontSize: '11px', color: 'var\(--text-muted\)', marginTop: '2px' \}\}>New traders only, Block dealers<\/div>\n                                    <\/div>\n                                <\/div>\n                                <div style=\{\{ color: 'var\(--text-muted\)', fontSize: '18px' \}\}>›<\/div>\n                            <\/div>")

modal_block_pattern = re.compile(r"            \{\/\* Special Options Full Screen Modal \*\/.*?<\/div>\n            \)\}\n", re.DOTALL)

new_accordion_ui = """                            <div className="co-section-title" style={{ marginTop: '16px' }}>9. Advanced Settings</div>
                            <div 
                                onClick={() => { haptic('selection'); setIsAdvancedSettingsExpanded(!isAdvancedSettingsExpanded); }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: isAdvancedSettingsExpanded ? '8px 8px 0 0' : '8px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>⚙️</div>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Advanced Settings</div>
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>New traders only, Block dealers</div>
                                    </div>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '18px', transform: isAdvancedSettingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>›</div>
                            </div>
                            
                            {isAdvancedSettingsExpanded && (
                                <div style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 8px 8px', animation: 'slideDown 0.2s ease-out' }}>
                                    {/* New Traders Only Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>New Traders Only</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Only users with 0 completed trades can buy/sell</div>
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
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {newTradersOnly ? 'ON' : 'OFF'}
                                        </button>
                                    </div>

                                    {/* Exclude Specific Dealers */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '12px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Block Specific Dealers</div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Prevent specific users from taking this ad</div>
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
                                                    fontSize: '11px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                + Add
                                            </button>
                                        </div>

                                        {excludedDealerUsernames.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
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
                                                            fontSize: '11px',
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
                            )}"""

if not main_block_pattern.search(content):
    print("Could not find main block")
else:
    content = re.sub(main_block_pattern, new_accordion_ui, content)
    content = re.sub(modal_block_pattern, "", content)
    with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
        f.write(content)
    print("Applied advanced settings accordion changes")
