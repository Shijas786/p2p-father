import re

def replace_in_file(filepath, old, new):
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)

# Wallet.tsx
replace_in_file('miniapp/src/pages/Wallet.tsx', 'const gasPrice = undefined;', "const gasPrice = isBsc ? parseUnits('0.06', 9) : undefined;")
# Need to import parseUnits if missing, but it might already be there because we just removed it
with open('miniapp/src/pages/Wallet.tsx', 'r') as f:
    if "parseUnits" not in f.read():
        print("Missing parseUnits in Wallet.tsx!")

# CreateOrder.tsx
replace_in_file('miniapp/src/pages/CreateOrder.tsx', 'const gasPrice = undefined;', "const gasPrice = isBsc ? parseUnits('0.06', 9) : undefined;")

# TradeDetail.tsx
replace_in_file('miniapp/src/pages/TradeDetail.tsx', 'const gasPrice = undefined;', "const gasPrice = isBsc ? parseUnits('0.06', 9) : undefined;")

# escrow.ts
with open('src/services/escrow.ts', 'r') as f:
    escrow_content = f.read()

# Replace all occurrences of // txOptions.gasPrice = ... with txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");
escrow_content = re.sub(r'//\s*txOptions\.gasPrice\s*=\s*ethers\.parseUnits\([^)]+\);\n', 'txOptions.gasPrice = ethers.parseUnits("0.06", "gwei");\n', escrow_content)

with open('src/services/escrow.ts', 'w') as f:
    f.write(escrow_content)

