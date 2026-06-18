import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# We want to keep everything up to the first {/* Exclude Dealers Full Screen Modal */} 
# and then output one modal, then </div>); }

idx = content.find("{/* Exclude Dealers Full Screen Modal */}")

if idx != -1:
    new_content = content[:idx] + """{/* Exclude Dealers Full Screen Modal */}
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
            )}
        </div>
    );
}
"""
    with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
        f.write(new_content)
    print("Fixed syntax error")
else:
    print("Could not find the start of the duplicate blocks.")
