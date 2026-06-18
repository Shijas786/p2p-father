from PIL import Image
import sys

try:
    img = Image.open('miniapp/src/assets/mascot.png')
    img = img.convert('RGBA')
    bbox = img.getbbox()
    print(f"Image size: {img.size}")
    print(f"Bounding box (left, top, right, bottom): {bbox}")
    bottom_padding = img.size[1] - bbox[3]
    print(f"Transparent padding at bottom: {bottom_padding} pixels")
except Exception as e:
    print(f"Error: {e}")
