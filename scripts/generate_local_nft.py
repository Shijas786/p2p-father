import os
import json
import random
import torch
from diffusers import AutoPipelineForText2Image

# ==========================================
# TRAIT CONFIGURATION & PROBABILITIES
# ==========================================

MASTER_STYLE = "high quality digital illustration, bold clean lines, vibrant colors, strong character design, expressive face, detailed shading, consistent NFT PFP art style, portrait bust format, transparent background, 512x512, professional NFT collection, BAYC color palette, centered composition, no background."

TRAITS = {
    "Base Face": [
        {"name": "Young Rugged Dad", "weight": 20, "prompt": "young rugged dad portrait bust, strong square jaw, neutral bored expression, broad shoulders, light skin tone"},
        {"name": "Middle Aged Dad", "weight": 20, "prompt": "middle aged dad portrait bust, heavy lidded tired eyes, warm medium brown skin tone, slight stubble on jaw"},
        {"name": "Buff Intimidating Dad", "weight": 20, "prompt": "buff intimidating dad portrait bust, square jaw, intense serious stare, dark brown skin tone, muscular neck and shoulders"},
        {"name": "Wise Distinguished Dad", "weight": 20, "prompt": "wise distinguished older dad portrait bust, deep set eyes, salt pepper hair, olive skin tone, strong nose"},
        {"name": "Tough Bald Dad", "weight": 20, "prompt": "tough bald dad portrait bust, shiny bald head, stern no nonsense expression, pale skin tone, thick neck"}
    ],
    "Beard": [
        {"name": "Short Dark Stubble", "weight": 60, "prompt": "short dark stubble beard, 5 o clock shadow, realistic texture"},
        {"name": "Neat Trimmed Black Beard", "weight": 60, "prompt": "neat trimmed black beard, sharp clean edges, well groomed"},
        {"name": "Thick Full Brown Beard", "weight": 25, "prompt": "thick full brown beard, voluminous and bold, well shaped"},
        {"name": "Ginger Red Thick Beard", "weight": 25, "prompt": "ginger red thick beard, bright warm orange tones, full coverage"},
        {"name": "Long Dark Viking Beard", "weight": 25, "prompt": "long dark viking beard, slightly wavy, rugged masculine"},
        {"name": "Long Silver Grey Beard", "weight": 10, "prompt": "long silver grey wise beard, distinguished and full"},
        {"name": "Mutton Chop Sideburns", "weight": 10, "prompt": "mutton chop sideburns only, no chin beard, vintage character"},
        {"name": "Sharp Goatee", "weight": 10, "prompt": "sharp goatee beard, pointed tip, slick bold character"},
        {"name": "Massive Wild Untamed Beard", "weight": 4, "prompt": "massive wild untamed beard, enormous volume, windswept dramatic"},
        {"name": "Glowing Gold Metallic Beard", "weight": 1, "prompt": "glowing gold metallic beard, shimmering divine gold tones, god tier father energy"}
    ],
    "Moustache": [
        {"name": "Classic Chevron Moustache", "weight": 60, "prompt": "classic chevron moustache, dark brown, clean and sharp"},
        {"name": "Thin Pencil Moustache", "weight": 60, "prompt": "thin pencil moustache, sleek black, sharp elegant lines"},
        {"name": "Thick Walrus Moustache", "weight": 25, "prompt": "thick walrus moustache, full and droopy, warm brown tones"},
        {"name": "Handlebar Moustache", "weight": 25, "prompt": "handlebar moustache, dramatically curled ends, bold character"},
        {"name": "Fu Manchu Moustache", "weight": 10, "prompt": "fu manchu moustache, long dramatic hanging ends, dark and sharp"},
        {"name": "Rugged Cowboy Moustache", "weight": 10, "prompt": "rugged cowboy moustache, thick and western, warm brown tones"},
        {"name": "Oversized Comedy Moustache", "weight": 4, "prompt": "absurdly oversized comedy moustache, enormous curled dramatic"},
        {"name": "Glowing Gold Moustache", "weight": 1, "prompt": "glowing gold moustache, metallic shimmering gold tones"}
    ],
    "Eyes": [
        {"name": "Warm Kind Brown Eyes", "weight": 60, "prompt": "warm kind brown dad eyes, subtle smile wrinkles at corners"},
        {"name": "Tired Baggy Eyes", "weight": 60, "prompt": "tired baggy dad eyes, heavy lids, dark under eye circles"},
        {"name": "Stern Intense Eyes", "weight": 60, "prompt": "stern intense dad eyes, sharp focused gaze, strong brows"},
        {"name": "Squinting Happy Eyes", "weight": 25, "prompt": "squinting happy eyes, laughing expression, crow feet"},
        {"name": "Gold Aviator Sunglasses", "weight": 25, "prompt": "wearing gold aviator sunglasses, cool reflective tinted lenses"},
        {"name": "Round Wire Frame Glasses", "weight": 25, "prompt": "wearing round wire frame glasses, intellectual wise dad"},
        {"name": "Vintage Monocle", "weight": 10, "prompt": "wearing vintage monocle on right eye, distinguished gentleman dad"},
        {"name": "Red Laser Eyes", "weight": 10, "prompt": "red laser eyes, glowing vivid red energy beams shooting outward, dramatic glow effect"},
        {"name": "Blue Electric Laser Eyes", "weight": 4, "prompt": "blue electric laser eyes, intense electric blue beams, dramatic glow"},
        {"name": "Green Crypto Laser Eyes", "weight": 4, "prompt": "green crypto laser eyes, matrix green energy beams, P2P vibes"},
        {"name": "Gold Divine Laser Eyes", "weight": 1, "prompt": "gold divine laser eyes, blazing golden beams, god mode father, dramatic golden glow"},
        {"name": "White Supernatural Laser Eyes", "weight": 1, "prompt": "white supernatural laser eyes, all seeing father energy, blinding white glow beams"}
    ],
    "Hat": [
        {"name": "Navy Baseball Cap", "weight": 60, "prompt": "wearing plain navy baseball cap forwards, slightly worn, casual dad"},
        {"name": "Red Backwards Snapback", "weight": 60, "prompt": "wearing red backwards snapback cap, street casual dad energy"},
        {"name": "Grey Wool Beanie", "weight": 60, "prompt": "wearing grey wool beanie, cozy slouchy dad hat"},
        {"name": "Tan Bucket Hat", "weight": 60, "prompt": "wearing tan bucket hat, dad on holiday, floppy brim"},
        {"name": "No Hat", "weight": 60, "prompt": "no hat, bare head"},
        {"name": "Brown Cowboy Hat", "weight": 25, "prompt": "wearing brown cowboy hat, rugged western father, bold brim"},
        {"name": "Yellow Construction Hat", "weight": 25, "prompt": "wearing yellow construction hard hat, working class dad hero"},
        {"name": "Dark Green Military Beret", "weight": 25, "prompt": "wearing dark green military beret, disciplined stern father"},
        {"name": "Black Bandana", "weight": 25, "prompt": "wearing black bandana tied on head, rebel biker dad"},
        {"name": "Tall White Chef Hat", "weight": 25, "prompt": "wearing tall white chef hat, master of the BBQ dad"},
        {"name": "Viking Horned Helmet", "weight": 10, "prompt": "wearing viking horned helmet, warrior patriarch, bold metallic detail"},
        {"name": "Tall Purple Wizard Hat", "weight": 10, "prompt": "wearing tall purple wizard hat with stars, mystical wise father"},
        {"name": "Black Graduation Cap", "weight": 10, "prompt": "wearing black graduation cap with gold tassel, intellectual father"},
        {"name": "Jeweled Gold Crown", "weight": 4, "prompt": "wearing ornate jeweled gold crown, king father, bold rich detail"},
        {"name": "Glowing Golden Halo", "weight": 1, "prompt": "glowing golden halo floating above head, divine holy father, warm golden glow light rays"}
    ],
    "Outfit": [
        {"name": "Grey Hoodie", "weight": 60, "prompt": "wearing grey hoodie collar and chest, crypto casual dad"},
        {"name": "White Plain T-Shirt", "weight": 60, "prompt": "wearing white plain t-shirt, everyday regular dad"},
        {"name": "Sharp Suit and Tie", "weight": 25, "prompt": "wearing sharp suit and tie, corporate crypto boss dad, navy blue"},
        {"name": "Black Leather Biker Jacket", "weight": 10, "prompt": "wearing black studded leather biker jacket, rebel father energy"},
        {"name": "Superhero Cape", "weight": 1, "prompt": "wearing red and gold superhero cape collar, P2P Father logo on chest, dramatic flowing fabric, glowing gold trim"}
    ],
    "Accessories": [
        {"name": "No Accessory", "weight": 60, "prompt": ""},
        {"name": "Silver Stud Earring", "weight": 60, "prompt": "small silver stud earring in one ear, subtle detail"},
        {"name": "Cuban Link Gold Chain", "weight": 25, "prompt": "wearing thick cuban link gold chain necklace, heavy bold gold"},
        {"name": "Lit Cigar", "weight": 25, "prompt": "lit cigar in mouth corner, boss dad energy, slight smoke"},
        {"name": "Wooden Smoking Pipe", "weight": 25, "prompt": "classic wooden smoking pipe in mouth, wise old dad energy"},
        {"name": "Gold Coin Medallion", "weight": 10, "prompt": "wearing P2P Father gold coin medallion pendant on chain, shiny gold detail"},
        {"name": "Tribal Face Paint", "weight": 10, "prompt": "tribal face paint markings on cheeks, warrior father"},
        {"name": "Teardrop Tattoo", "weight": 10, "prompt": "single teardrop tattoo under eye, street dad energy"},
        {"name": "Full Face War Paint", "weight": 4, "prompt": "full face war paint, dramatic bold color markings, battle father"},
        {"name": "Glowing Crypto Runes", "weight": 1, "prompt": "glowing P2P crypto rune symbols on face, mystical father, vivid glow effect"}
    ],
    "Background": [
        {"name": "Muted Olive Green", "weight": 60, "prompt": "flat muted olive green background, BAYC signature tone, solid fill backdrop"},
        {"name": "Muted Blue", "weight": 60, "prompt": "flat dusty muted blue background, cool calm tone, solid fill backdrop"},
        {"name": "Warm Beige", "weight": 60, "prompt": "flat warm tan beige background, earthy natural tone, solid fill backdrop"},
        {"name": "Burnt Orange", "weight": 25, "prompt": "flat burnt orange background, bold warm energy, solid fill backdrop"},
        {"name": "Army Green", "weight": 25, "prompt": "flat army green background, rugged masculine tone, solid fill backdrop"},
        {"name": "Deep Teal", "weight": 25, "prompt": "flat deep teal background, rich moody tone, solid fill backdrop"},
        {"name": "Burgundy Red", "weight": 10, "prompt": "flat deep burgundy red background, bold dramatic, solid fill backdrop"},
        {"name": "Charcoal Grey", "weight": 10, "prompt": "flat dark charcoal grey background, mysterious dark tone, solid fill backdrop"},
        {"name": "Royal Purple", "weight": 4, "prompt": "flat royal purple background, power and prestige, solid fill backdrop"},
        {"name": "Metallic Gold", "weight": 1, "prompt": "flat shimmering metallic gold background, divine father tier, solid fill backdrop"}
    ]
}

# ==========================================
# GENERATION LOGIC
# ==========================================

def get_weighted_random_trait(trait_list):
    total_weight = sum(item['weight'] for item in trait_list)
    r = random.uniform(0, total_weight)
    upto = 0
    for item in trait_list:
        if upto + item['weight'] >= r:
            return item
        upto += item['weight']
    return trait_list[-1]

def generate_nfts(total_amount=1000):
    output_dir = os.path.join(os.getcwd(), 'nft_output')
    images_dir = os.path.join(output_dir, 'images')
    metadata_dir = os.path.join(output_dir, 'metadata')
    
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(metadata_dir, exist_ok=True)
    
    print("Loading Stable Diffusion Pipeline (MPS Backend)...")
    # Using SDXL for highest quality portrait generation, optimized for Mac MPS
    pipe = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", 
        torch_dtype=torch.float16, 
        use_safetensors=True,
        variant="fp16"
    )
    pipe.to("mps")
    
    # Optional: reduce memory usage if Mac has less than 16GB unified memory
    # pipe.enable_attention_slicing()

    generated_count = 0
    while generated_count < total_amount:
        token_id = generated_count + 1
        print(f"\n--- Generating NFT #{token_id} ---")
        
        # Roll traits
        selected_traits = {}
        prompt_parts = []
        
        for category, options in TRAITS.items():
            trait = get_weighted_random_trait(options)
            selected_traits[category] = trait["name"]
            if trait["prompt"]:
                prompt_parts.append(trait["prompt"])
        
        # Construct exact prompt
        full_prompt = f"{', '.join(prompt_parts)}. {MASTER_STYLE}"
        print(f"Traits: {selected_traits}")
        
        # Generate Image
        try:
            image = pipe(
                prompt=full_prompt,
                negative_prompt="ugly, deformed, poorly drawn, extra limbs, bad proportions, watermark, text, signature, low resolution, photorealistic",
                num_inference_steps=25,
                guidance_scale=7.5
            ).images[0]
            
            image_path = os.path.join(images_dir, f"{token_id}.png")
            image.save(image_path)
            
            # Save ERC-721 Metadata
            metadata = {
                "name": f"Genesis P2PFather #{token_id}",
                "description": "An exclusive P2PFather platform Genesis collection item.",
                "image": f"ipfs://placeholder_hash/{token_id}.png",
                "attributes": [
                    {"trait_type": category, "value": name} 
                    for category, name in selected_traits.items()
                ]
            }
            
            metadata_path = os.path.join(metadata_dir, f"{token_id}.json")
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=4)
                
            print(f"✅ Successfully saved #{token_id}")
            generated_count += 1
            
        except Exception as e:
            print(f"❌ Error generating #{token_id}: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate P2PFather NFTs locally using MPS.")
    parser.add_argument("--count", type=int, default=10, help="Number of NFTs to generate (default 10 for testing).")
    args = parser.parse_args()
    
    generate_nfts(args.count)
