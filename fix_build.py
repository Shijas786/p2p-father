import re

with open('miniapp/src/lib/api.ts', 'r') as f:
    api_content = f.read()

old_api_type = """            note?: string;
            excluded_dealers?: string;
            expires_in?: number;
        }) =>"""
new_api_type = """            note?: string;
            excluded_dealers?: string;
            allowed_dealers?: string;
            expires_in?: number;
            new_traders_only?: boolean;
        }) =>"""

api_content = api_content.replace(old_api_type, new_api_type)
with open('miniapp/src/lib/api.ts', 'w') as f:
    f.write(api_content)

with open('miniapp/src/pages/CreateOrder.tsx', 'r') as f:
    co_content = f.read()

old_api_call = """                note: note.trim() || undefined,
                excluded_dealers: excludedDealerUsernames.join(',') || undefined,
                expires_in: expiryMinutes,
                new_traders_only: newTradersOnly,"""
new_api_call = """                note: note.trim() || undefined,
                excluded_dealers: excludedDealerUsernames.join(',') || undefined,
                allowed_dealers: allowedDealerUsernames.join(',') || undefined,
                expires_in: expiryMinutes,
                new_traders_only: newTradersOnly,"""

co_content = co_content.replace(old_api_call, new_api_call)
with open('miniapp/src/pages/CreateOrder.tsx', 'w') as f:
    f.write(co_content)

print("Fixed build errors")
