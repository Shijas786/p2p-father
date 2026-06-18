import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# Replace state
content = content.replace("const [isDropdownOpen, setIsDropdownOpen] = useState(false);", "const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);\n    const [excludeSearchQuery, setExcludeSearchQuery] = useState('');")

# Extract the old UI using a regex since exact matching with whitespace can be flaky
import re
old_ui_pattern = re.compile(r"\{\/\* Exclude Specific Dealers \*\/.*?\}\)\}\s*<\/div>\s*<\/div>", re.DOTALL)

# Let's verify we found it
match = old_ui_pattern.search(content)

if not match:
    print("Could not find old UI block. Applying manual replacement.")
    # Attempting more precise manual replace if needed...
    pass
else:
    # Found the block, replace it
    new_ui = """{/* Exclude Specific Dealers */}
                            <div className="co-section-title" style={{ marginTop: '16px' }}>8. Exclude Specific Dealers <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '11px' }}>(optional)</span></div>
                            <div style={{ marginBottom: '16px' }}>
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
                            </div>"""
    content = content[:match.start()] + new_ui + content[match.end():]

modal_ui = """            {/* Exclude Dealers Full Screen Modal */}
            {isExcludeModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 999999,
                    background: 'var(--bg-main)',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Block Specific Dealers</div>
                        <button onClick={() => setIsExcludeModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '14px', fontWeight: 'bold' }}>Done</button>
                    </div>
                    
                    <div style={{ padding: '12px 16px' }}>
                        <input 
                            type="text" 
                            placeholder="Search username..." 
                            value={excludeSearchQuery}
                            onChange={e => setExcludeSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '12px',
                                color: '#fff',
                                outline: 'none',
                                fontSize: '14px'
                            }}
                        />
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>
                        {allUsers.filter(u => u.username.toLowerCase().includes(excludeSearchQuery.toLowerCase())).map(u => {
                            const isSelected = excludedDealerUsernames.includes(u.username);
                            return (
                                <div
                                    key={u.id}
                                    onClick={() => {
                                        haptic('selection');
                                        setExcludedDealerUsernames(prev =>
                                            prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                        );
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '16px 0',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {u.photo_url ? (
                                            <img src={u.photo_url} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} alt="" />
                                        ) : (
                                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #ff4d4d, #f43f5e)', color: '#fff', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {u.username.substring(0, 1).toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ fontSize: '15px', color: isSelected ? '#ff453a' : '#fff', fontWeight: isSelected ? 'bold' : 'normal' }}>@{u.username}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{u.completed_trades || 0} trades</div>
                                        </div>
                                    </div>
                                    
                                    <div style={{
                                        width: '24px', height: '24px', borderRadius: '50%',
                                        border: `2px solid ${isSelected ? '#ff453a' : 'rgba(255,255,255,0.2)'}`,
                                        background: isSelected ? '#ff453a' : 'transparent',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'all 0.2s ease'
                                    }}>
                                        {isSelected && <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>✓</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}"""

content = content.replace("        </div>\n    );\n}", modal_ui + "\n        </div>\n    );\n}")

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)
