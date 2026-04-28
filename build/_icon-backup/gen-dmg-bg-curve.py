"""
Alcove-style minimal DMG background for Nookra with a subtle equity-curve
connector between the app icon (left) and Applications folder (right).

Canvas: 600x400 @1x and 1200x800 @2x.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SF = "/System/Library/Fonts/SFNS.ttf"


def lerp(a, b, t):
    return int(a + (b - a) * t)


def bg_gradient(W, H):
    img = Image.new("RGB", (W, H))
    top = (7, 11, 9)
    bot = (3, 5, 4)
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        c = (
            lerp(top[0], bot[0], t),
            lerp(top[1], bot[1], t),
            lerp(top[2], bot[2], t),
        )
        for x in range(W):
            px[x, y] = c
    return img


def add_radial_glow(img, cx, cy, radius, color_rgba):
    W, H = img.size
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.ellipse(
        (cx - radius, cy - radius, cx + radius, cy + radius),
        fill=color_rgba,
    )
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius * 0.45))
    return Image.alpha_composite(img.convert("RGBA"), overlay)


def catmull_rom(points, samples_per_seg=40):
    # Duplicate endpoints as phantom control points for proper tangents.
    ext = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(len(ext) - 3):
        p0, p1, p2, p3 = ext[i], ext[i + 1], ext[i + 2], ext[i + 3]
        for j in range(samples_per_seg):
            t = j / samples_per_seg
            t2, t3 = t * t, t * t * t
            x = 0.5 * (
                (2 * p1[0])
                + (-p0[0] + p2[0]) * t
                + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            )
            y = 0.5 * (
                (2 * p1[1])
                + (-p0[1] + p2[1]) * t
                + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            )
            out.append((x, y))
    out.append(points[-1])
    return out


def render(scale):
    W, H = 600 * scale, 400 * scale

    img = bg_gradient(W, H).convert("RGBA")

    # Subtle ambient green wash behind the curve area.
    img = add_radial_glow(img, W // 2, int(H * 0.46), int(W * 0.42), (30, 140, 85, 16))

    # Equity-curve control points (in 600x400 logical coords).
    # Trends up (195 -> 172), two gentle peaks, kept in the gap between icons.
    control = [
        (225, 195),
        (252, 178),
        (278, 196),
        (302, 172),
        (328, 187),
        (355, 164),
        (378, 172),
    ]
    scaled = [(x * scale, y * scale) for (x, y) in control]
    curve = catmull_rom(scaled, samples_per_seg=40)

    # Halo pass: wide, semi-transparent, heavily blurred.
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).line(
        curve,
        fill=(90, 230, 155, 120),
        width=max(5 * scale, 5),
        joint="curve",
    )
    halo = halo.filter(ImageFilter.GaussianBlur(4 * scale))

    # Core pass: thin, crisp line on top.
    core = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(core).line(
        curve,
        fill=(130, 245, 180, 225),
        width=max(scale, 1),
        joint="curve",
    )

    composed = Image.alpha_composite(img, halo)
    composed = Image.alpha_composite(composed, core)

    draw = ImageDraw.Draw(composed, "RGBA")
    try:
        hint_font = ImageFont.truetype(SF, 11 * scale)
        brand_font = ImageFont.truetype(SF, 9 * scale)
    except OSError:
        hint_font = ImageFont.load_default()
        brand_font = ImageFont.load_default()

    hint = "Drag to Applications"
    hb = draw.textbbox((0, 0), hint, font=hint_font)
    draw.text(
        ((W - (hb[2] - hb[0])) // 2, 312 * scale),
        hint,
        font=hint_font,
        fill=(255, 255, 255, 95),
    )

    brand = "Nookra"
    bb = draw.textbbox((0, 0), brand, font=brand_font)
    draw.text(
        ((W - (bb[2] - bb[0])) // 2, 30 * scale),
        brand,
        font=brand_font,
        fill=(255, 255, 255, 70),
    )

    return composed.convert("RGB")


base = "/Users/wesleychen/Documents/Cluade projects/Trading Journal/trading-journal-draft2/build"
render(1).save(f"{base}/dmg-background.png", optimize=True)
render(2).save(f"{base}/dmg-background@2x.png", optimize=True)
print("done")
