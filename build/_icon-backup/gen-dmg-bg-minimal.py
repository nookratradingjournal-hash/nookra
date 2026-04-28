"""
Minimal macOS-native DMG background for Nookra.
600x400 @1x + 1200x800 @2x.
"""
from PIL import Image, ImageDraw, ImageFont

SF = "/System/Library/Fonts/SFNS.ttf"

def lerp(a, b, t):
    return int(a + (b - a) * t)

def render(scale):
    W, H = 600 * scale, 400 * scale
    img = Image.new("RGB", (W, H), (20, 20, 24))

    # Very subtle vertical gradient (#141418 -> #0c0c0f)
    top = (20, 20, 24)
    bot = (12, 12, 15)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = (lerp(top[0], bot[0], t), lerp(top[1], bot[1], t), lerp(top[2], bot[2], t))
        for x in range(W):
            px[x, y] = c

    draw = ImageDraw.Draw(img, "RGBA")

    # "Drag to Applications" — small, low opacity, top center
    try:
        hint_font = ImageFont.truetype(SF, 11 * scale)
    except OSError:
        hint_font = ImageFont.load_default()
    hint = "Drag to Applications"
    hbox = draw.textbbox((0, 0), hint, font=hint_font)
    hw = hbox[2] - hbox[0]
    draw.text(
        ((W - hw) // 2, 48 * scale),
        hint,
        font=hint_font,
        fill=(255, 255, 255, 90),  # ~35% opacity
    )

    # Tiny "Nookra" wordmark — bottom center, very subtle
    try:
        brand_font = ImageFont.truetype(SF, 9 * scale)
    except OSError:
        brand_font = ImageFont.load_default()
    brand = "Nookra"
    bbox = draw.textbbox((0, 0), brand, font=brand_font)
    bw = bbox[2] - bbox[0]
    draw.text(
        ((W - bw) // 2, 368 * scale),
        brand,
        font=brand_font,
        fill=(255, 255, 255, 46),  # ~18% opacity
    )

    return img

base = "/Users/wesleychen/Documents/Cluade projects/Trading Journal/trading-journal-draft2/build"
render(1).save(f"{base}/dmg-background.png", optimize=True)
render(2).save(f"{base}/dmg-background@2x.png", optimize=True)
print("done")
