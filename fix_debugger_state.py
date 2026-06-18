with open('miniapp/src/pages/Profile.tsx', 'r') as f:
    content = f.read()

state_injection = """    const [themeHue, setThemeHue] = useState(160);

    const [mBottom, setMBottom] = useState(-24);
    const [mRight, setMRight] = useState(10);
    const [mHeight, setMHeight] = useState(110);
"""

content = content.replace("    const [themeHue, setThemeHue] = useState(160);", state_injection)

with open('miniapp/src/pages/Profile.tsx', 'w') as f:
    f.write(content)
print("Fixed state injection")
