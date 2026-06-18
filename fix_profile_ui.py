import re

# 1. Remove DP circle animation from Profile.css
with open('miniapp/src/pages/Profile.css', 'r') as f:
    css_content = f.read()

prof_avatar_before_pattern = re.compile(r"\.prof-avatar::before \{.*?pointer-events: none;\n\}", re.DOTALL)
if prof_avatar_before_pattern.search(css_content):
    css_content = re.sub(prof_avatar_before_pattern, "", css_content)
    with open('miniapp/src/pages/Profile.css', 'w') as f:
        f.write(css_content)
    print("Removed DP circle animation")
else:
    print("Could not find .prof-avatar::before in Profile.css")

# 2. Reduce mascot size in Profile.tsx
with open('miniapp/src/pages/Profile.tsx', 'r') as f:
    tsx_content = f.read()

old_mascot_height = "height: '180px', /* Scale this up to make it huge */"
new_mascot_height = "height: '140px', /* Slightly reduced size */"

if old_mascot_height in tsx_content:
    tsx_content = tsx_content.replace(old_mascot_height, new_mascot_height)
    with open('miniapp/src/pages/Profile.tsx', 'w') as f:
        f.write(tsx_content)
    print("Reduced mascot size")
else:
    print("Could not find mascot height in Profile.tsx")
