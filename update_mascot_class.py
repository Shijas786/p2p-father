with open('miniapp/src/pages/Profile.tsx', 'r') as f:
    content = f.read()

old_mascot = """                    {/* Mascot */}
                    <img 
                        src={mascotImg} 
                        alt="Mascot" 
                        style={{ 
                            position: 'absolute', 
                            bottom: '-14px', 
                            right: '88px', 
                            height: '110px', 
                            objectFit: 'contain', 
                            filter: `drop-shadow(0px 10px 15px rgba(0,0,0,0.5))`
                        }} 
                    />"""

new_mascot = """                    {/* Mascot */}
                    <img 
                        src={mascotImg} 
                        alt="Mascot" 
                        className="prof-mascot"
                    />"""

content = content.replace(old_mascot, new_mascot)

with open('miniapp/src/pages/Profile.tsx', 'w') as f:
    f.write(content)
