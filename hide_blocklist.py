import re

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    content = f.read()

# Replace border/margin of New Traders Only Toggle
old_new_traders = "                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>"
new_new_traders = "                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: newTradersOnly ? '0' : '12px', borderBottom: newTradersOnly ? 'none' : '1px solid rgba(255,255,255,0.05)', marginBottom: newTradersOnly ? '0' : '12px', transition: 'all 0.2s ease' }}>"

content = content.replace(old_new_traders, new_new_traders)

# Wrap Exclude Specific Dealers in {!newTradersOnly && ( ... )}
old_exclude_start = """                                    {/* Exclude Specific Dealers */}
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '8px' : '0' }}>"""

new_exclude_start = """                                    {/* Exclude Specific Dealers */}
                                    {!newTradersOnly && (
                                    <div style={{ animation: 'slideDown 0.2s ease-out' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: excludedDealerUsernames.length > 0 ? '8px' : '0' }}>"""

content = content.replace(old_exclude_start, new_exclude_start)

# Add closing bracket for the wrapper
old_exclude_end = """                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}"""

new_exclude_end = """                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            )}"""

content = content.replace(old_exclude_end, new_exclude_end)

# Also clear the blocklist array if they turn ON New Traders Only?
# We can do this in the onClick of the button!
old_button_click = "onClick={() => { haptic('selection'); setNewTradersOnly(!newTradersOnly); }}"
new_button_click = "onClick={() => { haptic('selection'); const next = !newTradersOnly; setNewTradersOnly(next); if(next) setExcludedDealerUsernames([]); }}"

content = content.replace(old_button_click, new_button_click)

with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(content)

print("Updated hide blocklist logic")
