import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# 1. State changes
old_state = """    const [excludedDealerUsernames, setExcludedDealerUsernames] = useState<string[]>([]);
    const [expiryMinutes, setExpiryMinutes] = useState(60); // 1 hour default
    const [isExcludeModalOpen, setIsExcludeModalOpen] = useState(false);"""
new_state = """    const [excludedDealerUsernames, setExcludedDealerUsernames] = useState<string[]>([]);
    const [allowedDealerUsernames, setAllowedDealerUsernames] = useState<string[]>([]);
    const [expiryMinutes, setExpiryMinutes] = useState(60); // 1 hour default
    const [dealerSelectionMode, setDealerSelectionMode] = useState<'exclude' | 'allow' | null>(null);"""
content = content.replace(old_state, new_state)

# 2. Revert the "hide blocklist" and add Whitelist
old_advanced = """                                    {/* Exclude Specific Dealers */}
                                    {!newTradersOnly && (
                                    <div style={{ animation: 'slideDown 0.2s ease-out' }}>
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
                                    )}"""

new_advanced = """                                    {/* Specific Dealers Only (Whitelist) */}
                                    <div style={{ paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: allowedDealerUsernames.length > 0 ? '8px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Specific Dealers Only</div>
                                                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Only selected users can take this ad</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { haptic('selection'); setDealerSelectionMode('allow'); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '4px 8px',
                                                    background: 'rgba(52, 199, 89, 0.1)',
                                                    border: '1px dashed rgba(52, 199, 89, 0.3)',
                                                    color: 'var(--green)',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                + Add
                                            </button>
                                        </div>

                                        {allowedDealerUsernames.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                {allowedDealerUsernames.map(username => (
                                                    <div
                                                        key={username}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '2px 8px',
                                                            background: 'rgba(52, 199, 89, 0.15)',
                                                            border: '1px solid rgba(52, 199, 89, 0.3)',
                                                            borderRadius: '100px',
                                                            fontSize: '10px',
                                                            color: 'var(--green)'
                                                        }}
                                                    >
                                                        @{username}
                                                        <div 
                                                            onClick={() => setAllowedDealerUsernames(prev => prev.filter(x => x !== username))}
                                                            style={{ cursor: 'pointer', background: 'rgba(52, 199, 89, 0.2)', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px' }}
                                                        >
                                                            ✕
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Exclude Specific Dealers */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '8px' : '0' }}>
                                            <div>
                                                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Block Dealers</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { haptic('selection'); setDealerSelectionMode('exclude'); }}
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
                                    </div>"""
content = content.replace(old_advanced, new_advanced)

# Restore the regular New Traders Only toggle (remove the automatic clearing and hide logic)
old_new_traders = "                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: newTradersOnly ? '0' : '12px', borderBottom: newTradersOnly ? 'none' : '1px solid rgba(255,255,255,0.05)', marginBottom: newTradersOnly ? '0' : '12px', transition: 'all 0.2s ease' }}>"
new_new_traders = "                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>"
content = content.replace(old_new_traders, new_new_traders)

old_toggle_btn = "onClick={() => { haptic('selection'); const next = !newTradersOnly; setNewTradersOnly(next); if(next) setExcludedDealerUsernames([]); }}"
new_toggle_btn = "onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}"
content = content.replace(old_toggle_btn, new_toggle_btn)

# 3. Update the Modal to handle both modes
old_modal = """            {/* Exclude Dealers Full Screen Modal */}
            {isExcludeModalOpen && ("""

new_modal = """            {/* Dealers Search Full Screen Modal */}
            {dealerSelectionMode !== null && ("""
content = content.replace(old_modal, new_modal)

old_modal_title = "<div style={{ fontSize: '16px', fontWeight: 'bold' }}>Block Specific Dealers</div>"
new_modal_title = "<div style={{ fontSize: '16px', fontWeight: 'bold' }}>{dealerSelectionMode === 'exclude' ? 'Block Dealers' : 'Allow Specific Dealers'}</div>"
content = content.replace(old_modal_title, new_modal_title)

old_modal_close = "onClick={() => setIsExcludeModalOpen(false)}"
new_modal_close = "onClick={() => setDealerSelectionMode(null)}"
content = content.replace(old_modal_close, new_modal_close)

# 4. Modal item selection logic
old_modal_item = """                        {allUsers.filter(u => u.username.toLowerCase().includes(excludeSearchQuery.toLowerCase())).map(u => {
                            const isSelected = excludedDealerUsernames.includes(u.username);
                            return (
                                <div
                                    key={u.id}
                                    onClick={() => {
                                        haptic('selection');
                                        setExcludedDealerUsernames(prev =>
                                            prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                        );
                                    }}"""

new_modal_item = """                        {allUsers.filter(u => u.username.toLowerCase().includes(excludeSearchQuery.toLowerCase())).map(u => {
                            const isSelected = dealerSelectionMode === 'exclude' 
                                ? excludedDealerUsernames.includes(u.username)
                                : allowedDealerUsernames.includes(u.username);
                            
                            const activeColor = dealerSelectionMode === 'exclude' ? '#ff453a' : 'var(--green)';

                            return (
                                <div
                                    key={u.id}
                                    onClick={() => {
                                        haptic('selection');
                                        if (dealerSelectionMode === 'exclude') {
                                            setExcludedDealerUsernames(prev =>
                                                prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                            );
                                        } else {
                                            setAllowedDealerUsernames(prev =>
                                                prev.includes(u.username) ? prev.filter(x => x !== u.username) : [...prev, u.username]
                                            );
                                        }
                                    }}"""
content = content.replace(old_modal_item, new_modal_item)

# 5. Fix modal colors to be dynamic (activeColor instead of hardcoded red)
old_colors_1 = "color: isSelected ? '#ff453a' : '#fff'"
new_colors_1 = "color: isSelected ? activeColor : '#fff'"
content = content.replace(old_colors_1, new_colors_1)

old_colors_2 = "border: `2px solid ${isSelected ? '#ff453a' : 'rgba(255,255,255,0.2)'}`"
new_colors_2 = "border: `2px solid ${isSelected ? activeColor : 'rgba(255,255,255,0.2)'}`"
content = content.replace(old_colors_2, new_colors_2)

old_colors_3 = "background: isSelected ? '#ff453a' : 'transparent'"
new_colors_3 = "background: isSelected ? activeColor : 'transparent'"
content = content.replace(old_colors_3, new_colors_3)

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)

print("Updated advanced settings")
