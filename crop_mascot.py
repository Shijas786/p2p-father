from PIL import Image

try:
    img = Image.open('miniapp/src/assets/mascot.png').convert('RGBA')
    bbox = img.getbbox()
    if bbox:
        # Crop the image to its bounding box (which removes transparent edges)
        cropped_img = img.crop(bbox)
        cropped_img.save('miniapp/src/assets/mascot.png')
        print("Cropped transparent edges from mascot.png")
        print(f"Old size: {img.size}, New size: {cropped_img.size}")
    else:
        print("Image is completely transparent.")
except Exception as e:
    print(f"Error: {e}")
