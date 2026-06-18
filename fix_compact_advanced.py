import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

old_ui_pattern = re.compile(r"                            <div className=\"co-section-title\" style=\{\{ marginTop: '16px' \}\}>9\. Advanced Settings<\/div>\n                            <div \n                                onClick=\{\(\) => \{ haptic\('selection'\); setIsAdvancedSettingsExpanded\(!isAdvancedSettingsExpanded\); \}\}.*?<\/div>\n                                <\/div>\n                            \)\}", re.DOTALL)


compact_ui = """                            <div className="co-section-title" style={{ marginTop: '16px' }}>9. Advanced Settings</div>
                            <div 
                                onClick={() => { haptic('selection'); setIsAdvancedSettingsExpanded(!isAdvancedSettingsExpanded); }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: isAdvancedSettingsExpanded ? '8px 8px 0 0' : '8px', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ fontSize: '14px' }}>⚙️</div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold' }}>Advanced Settings</div>
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '16px', transform: isAdvancedSettingsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>›</div>
                            </div>
                            
                            {isAdvancedSettingsExpanded && (
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 8px 8px', animation: 'slideDown 0.2s ease-out' }}>
                                    {/* New Traders Only Toggle */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>New Traders Only</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only 0 trade users</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}
                                            style={{
                                                background: newTradersOnly ? 'var(--green)' : 'rgba(255,255,255,0.1)',
                                                color: newTradersOnly ? '#000' : '#fff',
                                                border: 'none',
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '10px',
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
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '8px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Block Dealers</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { haptic('selection'); setIsExcludeModalOpen(true); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 8px',
                                                    background: 'rgba(255, 69, 58, 0.1)',
                                                    border: '1px dashed rgba(255, 69, 58, 0.3)',
                                                    color: '#ff453a',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                + Add
                                            </button>
                                        </div>

                                        {excludedDealerUsernames.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                {excludedDealerUsernames.map(username => (
                                                    <div
                                                        key={username}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: 'rgba(255, 69, 58, 0.15)',
                                                            border: '1px solid rgba(255, 69, 58, 0.3)',
                                                            borderRadius: '100px',
                                                            fontSize: '10px',
                                                            color: '#ff453a'
                                                        }}
                                                    >
                                                        @{username}
                                                        <div 
                                                            onClick={() => setExcludedDealerUsernames(prev => prev.filter(x => x !== username))}
                                                            style={{ cursor: 'pointer', background: 'rgba(255,69,58,0.2)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}
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

if not old_ui_pattern.search(content):
    print("Could not match old UI")
else:
    content = re.sub(old_ui_pattern, compact_ui, content)
    with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
        f.write(content)
    print("Made advanced settings more compact")
