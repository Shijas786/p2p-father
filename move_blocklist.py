import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. Remove the old Exclude Specific Dealers block
old_exclude_block_pattern = re.compile(r"                            \{\/\* Exclude Specific Dealers \*\/.*?<\/div>\n\n", re.DOTALL)
content = re.sub(old_exclude_block_pattern, "", content)

# 2. Change '9. Ad Duration' to '8. Ad Duration'
content = content.replace("9. Ad Duration", "8. Ad Duration")

# 3. Replace '10. Special Options' block with the new combined one
old_special_options_pattern = re.compile(r"                            <div className=\"co-section-title\" style=\{\{ marginTop: '16px' \}\}>10\. Special Options<\/div>\n                            <div style=\{\{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba\(255,255,255,0\.03\)', borderRadius: '8px', border: '1px solid rgba\(255,255,255,0\.08\)' \}\}>\n                                <div>\n                                    <div style=\{\{ fontSize: '13px', fontWeight: 'bold' \}\}>New Traders Only<\/div>\n                                    <div style=\{\{ fontSize: '10px', color: 'var\(--text-muted\)' \}\}>Only users with 0 completed trades can buy/sell<\/div>\n                                <\/div>\n                                <button\n                                    type=\"button\"\n                                    onClick=\{\(\) => \{ haptic\('selection'\); setNewTradersOnly\(!newTradersOnly\); \}\}\n                                    style=\{\{\n                                        background: newTradersOnly \? 'var\(--green\)' : 'rgba\(255,255,255,0\.1\)',\n                                        color: newTradersOnly \? '#000' : '#fff',\n                                        border: 'none',\n                                        padding: '6px 12px',\n                                        borderRadius: '16px',\n                                        fontSize: '11px',\n                                        fontWeight: 'bold',\n                                        cursor: 'pointer',\n                                        transition: 'all 0\.2s ease'\n                                    \}\}\n                                >\n                                    \{newTradersOnly \? 'ON' : 'OFF'\}\n                                <\/button>\n                            <\/div>")

new_special_options = """                            <div className="co-section-title" style={{ marginTop: '16px' }}>9. Special Options</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                
                                {/* New Traders Only Toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

                                {/* Exclude Specific Dealers */}
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Block specific dealers</div>
                                    <button
                                        type="button"
                                        onClick={() => { haptic('selection'); setIsExcludeModalOpen(true); }}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            padding: '10px',
                                            background: 'rgba(255, 69, 58, 0.1)',
                                            border: '1px dashed rgba(255, 69, 58, 0.3)',
                                            color: '#ff453a',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        + Add Users to Blocklist
                                    </button>

                                    {excludedDealerUsernames.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                            {excludedDealerUsernames.map(username => (
                                                <div
                                                    key={username}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '4px 10px',
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
                                                        style={{ cursor: 'pointer', background: 'rgba(255,69,58,0.2)', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}
                                                    >
                                                        ✕
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>"""

if not old_special_options_pattern.search(content):
    print("Could not match old special options.")
else:
    content = re.sub(old_special_options_pattern, new_special_options, content)
    with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
        f.write(content)
    print("Successfully moved exclude specific dealers to special options")
