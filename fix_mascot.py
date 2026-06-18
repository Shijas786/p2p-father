with open('miniapp/src/pages/Profile.tsx', 'r') as f:
    content = f.read()

content = content.replace("bottom: '-40px', /* FIXED GAP for lying down image */", "bottom: '-24px', /* Aligns perfectly with 24px padding-bottom of container */")
content = content.replace("height: '90%',", "height: '110px',")

with open('miniapp/src/pages/Profile.tsx', 'w') as f:
    f.write(content)
print("Fixed mascot position")
