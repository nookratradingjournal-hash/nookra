"""
Light, Alcove-inspired DMG background for Nookra.
Warm cream background with a realistic upward-trending equity curve and
translucent fill area between the app icon and Applications folder.

Canvas: 600x400 @1x and 1200x800 @2x.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SF = "/System/Library/Fonts/SFNS.ttf"


def lerp(a, b, t):
    return int(a + (b - a) * t)


def bg_gradient(W, H):
    img = Image.new("RGB", (W, H))
    top = (245, 240, 229)    # warm cream
    bot = (232, 220, 196)    # slightly deeper cream
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


def catmull_rom(points, samples_per_seg=50):
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

    # Realistic equity curve: steady uptrend with two small pullbacks.
    control = [
        (222, 208),
        (238, 198),
        (258, 204),
        (280, 182),
        (302, 192),
        (328, 166),
        (352, 174),
        (378, 148),
    ]
    scaled = [(x * scale, y * scale) for (x, y) in control]
    curve = catmull_rom(scaled, samples_per_seg=60)

    baseline_y = 250 * scale
    curve_top_y = int(min(p[1] for p in curve))

    # --- Filled area below curve (vertical alpha gradient) ---
    poly_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    polygon = [(curve[0][0], baseline_y)] + list(curve) + [(curve[-1][0], baseline_y)]
    ImageDraw.Draw(poly_layer).polygon(polygon, fill=(34, 160, 90, 255))

    grad = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        if y < curve_top_y or y > baseline_y:
            continue
        t = (y - curve_top_y) / max(1, (baseline_y - curve_top_y))
        # fade from ~70 near curve to 0 at baseline
        val = int(70 * (1 - t) ** 1.4)
        gd.line([(0, y), (W, y)], fill=val)

    _, _, _, poly_a = poly_layer.split()
    combined_a = ImageChops.multiply(poly_a, grad)
    poly_layer.putalpha(combined_a)

    # --- Halo under the curve line ---
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(halo).line(
        curve,
        fill=(34, 160, 90, 90),
        width=max(4 * scale, 4),
        joint="curve",
    )
    halo = halo.filter(ImageFilter.GaussianBlur(3 * scale))

    # --- Core line: crisp forest green ---
    core = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(core).line(
        curve,
        fill=(21, 128, 61, 255),
        width=max(int(1.6 * scale), 2),
        joint="curve",
    )

    # Endpoint marker: small filled dot with white halo
    end_x, end_y = scaled[-1]
    dot_r = int(3.2 * scale)
    md = ImageDraw.Draw(core)
    # outer white halo
    md.ellipse(
        (end_x - dot_r - scale, end_y - dot_r - scale,
         end_x + dot_r + scale, end_y + dot_r + scale),
        fill=(255, 255, 255, 230),
    )
    # filled green dot
    md.ellipse(
        (end_x - dot_r, end_y - dot_r, end_x + dot_r, end_y + dot_r),
        fill=(21, 128, 61, 255),
    )

    composed = Image.alpha_composite(img, poly_layer)
    composed = Image.alpha_composite(composed, halo)
    composed = Image.alpha_composite(composed, core)

    # --- Text ---
    draw = ImageDraw.Draw(composed, "RGBA")
    try:
        hint_font = ImageFont.truetype(SF, 11 * scale)
        brand_font = ImageFont.truetype(SF, 10 * scale)
    except OSError:
        hint_font = ImageFont.load_default()
        brand_font = ImageFont.load_default()

    ink = (58, 50, 40, 140)  # warm dark gray, ~55% alpha

    hint = "Drag to Applications"
    hb = draw.textbbox((0, 0), hint, font=hint_font)
    draw.text(
        ((W - (hb[2] - hb[0])) // 2, 312 * scale),
        hint,
        font=hint_font,
        fill=ink,
    )

    brand = "Nookra"
    bb = draw.textbbox((0, 0), brand, font=brand_font)
    draw.text(
        ((W - (bb[2] - bb[0])) // 2, 32 * scale),
        brand,
        font=brand_font,
        fill=(58, 50, 40, 160),
    )

    return composed.convert("RGB")


base = "/Users/wesleychen/Documents/Cluade projects/Trading Journal/trading-journal-draft2/build"
render(1).save(f"{base}/dmg-background.png", optimize=True)
render(2).save(f"{base}/dmg-background@2x.png", optimize=True)
print("done")
