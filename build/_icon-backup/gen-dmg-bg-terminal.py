#!/usr/bin/env python3
"""Generate DMG installer background PNGs (1x and 2x) to exact spec.

Output:
  build/dmg-background.png     600x400
  build/dmg-background@2x.png  1200x800
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, os.pardir))
OUT_1X = os.path.join(BUILD_DIR, "dmg-background.png")
OUT_2X = os.path.join(BUILD_DIR, "dmg-background@2x.png")

# ---------------------------------------------------------------------------
# Spec
# ---------------------------------------------------------------------------
LOGICAL_W = 600
LOGICAL_H = 450

TOP_COLOR = (245, 232, 215)
BOTTOM_COLOR = (236, 218, 195)

TITLE_TEXT = "Nookra"
TITLE_FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
TITLE_FONT_SIZE_PT = 60
TITLE_Y_TOP_PX = 40
TITLE_COLOR = (26, 26, 26)

APP_RECT_CENTER = (440, 180)
APP_RECT_W = 148
APP_RECT_H = 148
APP_RECT_CORNER_R = 32
APP_RECT_STROKE = 2.0
APP_RECT_DASH = 8
APP_RECT_GAP = 6
APP_RECT_COLOR = (140, 125, 110)
APP_RECT_ALPHA = 230

ARROW_CONTROL_POINTS = [
    (195, 290),
    (225, 320),
    (275, 345),
    (330, 355),
    (390, 350),
    (438, 325),
    (460, 285),
]
ARROW_STROKE = 2.2
ARROW_DASH = 7
ARROW_GAP = 5
ARROW_COLOR = (120, 105, 92)
ARROW_ALPHA = 235
ARROWHEAD_LEN = 14
ARROWHEAD_HALF_ANGLE_DEG = 28
ARROW_FADE_LENGTH = 55  # subtle fade at left tail, like Alcove

SUPERSAMPLE = 4  # render dashed layers at 4x their target size


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_title_font(size_px):
    for path in TITLE_FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size_px)
            except Exception:
                continue
    return ImageFont.load_default()


def make_gradient(w, h, top_rgb, bottom_rgb):
    """Vertical linear gradient from top_rgb (y=0) to bottom_rgb (y=h-1)."""
    img = Image.new("RGB", (w, h), top_rgb)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        r = round(top_rgb[0] + (bottom_rgb[0] - top_rgb[0]) * t)
        g = round(top_rgb[1] + (bottom_rgb[1] - top_rgb[1]) * t)
        b = round(top_rgb[2] + (bottom_rgb[2] - top_rgb[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def catmull_rom_segment(p0, p1, p2, p3, n_samples):
    """Return n_samples points along the Catmull-Rom segment p1->p2 (uniform)."""
    pts = []
    for i in range(n_samples):
        t = i / n_samples
        t2 = t * t
        t3 = t2 * t
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
        pts.append((x, y))
    return pts


def catmull_rom_spline(points, samples_per_segment=120):
    """Sample a Catmull-Rom spline through `points`.

    Duplicates endpoints to anchor the curve at the first/last control point.
    Returns a polyline that STARTS at points[0] and ENDS at points[-1].
    """
    if len(points) < 2:
        return list(points)
    ctrl = [points[0]] + list(points) + [points[-1]]
    out = []
    for i in range(len(ctrl) - 3):
        seg = catmull_rom_segment(
            ctrl[i], ctrl[i + 1], ctrl[i + 2], ctrl[i + 3], samples_per_segment
        )
        out.extend(seg)
    out.append(points[-1])
    return out


def rounded_rect_polyline(cx, cy, w, h, r, corner_samples=28):
    """Build a closed polyline tracing a rounded rectangle perimeter.

    Starts at the top-left end of the top side and walks clockwise.
    Returns a list of (x, y).
    """
    x0 = cx - w / 2
    y0 = cy - h / 2
    x1 = cx + w / 2
    y1 = cy + h / 2
    r = min(r, w / 2, h / 2)

    pts = []
    # Top side: from (x0+r, y0) to (x1-r, y0)
    pts.append((x0 + r, y0))
    pts.append((x1 - r, y0))
    # Top-right corner: center (x1-r, y0+r), angles -90 -> 0
    cxr, cyr = x1 - r, y0 + r
    for i in range(1, corner_samples + 1):
        t = i / corner_samples
        a = math.radians(-90 + 90 * t)
        pts.append((cxr + r * math.cos(a), cyr + r * math.sin(a)))
    # Right side: to (x1, y1-r)
    pts.append((x1, y1 - r))
    # Bottom-right corner: center (x1-r, y1-r), angles 0 -> 90
    cxr, cyr = x1 - r, y1 - r
    for i in range(1, corner_samples + 1):
        t = i / corner_samples
        a = math.radians(0 + 90 * t)
        pts.append((cxr + r * math.cos(a), cyr + r * math.sin(a)))
    # Bottom side: to (x0+r, y1)
    pts.append((x0 + r, y1))
    # Bottom-left corner: center (x0+r, y1-r), angles 90 -> 180
    cxr, cyr = x0 + r, y1 - r
    for i in range(1, corner_samples + 1):
        t = i / corner_samples
        a = math.radians(90 + 90 * t)
        pts.append((cxr + r * math.cos(a), cyr + r * math.sin(a)))
    # Left side: to (x0, y0+r)
    pts.append((x0, y0 + r))
    # Top-left corner: center (x0+r, y0+r), angles 180 -> 270
    cxr, cyr = x0 + r, y0 + r
    for i in range(1, corner_samples + 1):
        t = i / corner_samples
        a = math.radians(180 + 90 * t)
        pts.append((cxr + r * math.cos(a), cyr + r * math.sin(a)))
    # Close loop back to start
    pts.append((x0 + r, y0))
    return pts


def draw_dashed_polyline(draw, points, dash_len, gap_len, color, width, closed=False, fade_length=0):
    """Walk a polyline and emit one draw.line() per complete dash.

    If fade_length > 0, dashes whose center lies within the first
    `fade_length` of arc distance get their alpha scaled from 0→full.
    """
    if len(points) < 2:
        return

    pts = list(points)
    if closed and pts[0] != pts[-1]:
        pts.append(pts[0])

    seg_lens = []
    total = 0.0
    for i in range(len(pts) - 1):
        dx = pts[i + 1][0] - pts[i][0]
        dy = pts[i + 1][1] - pts[i][1]
        d = math.hypot(dx, dy)
        seg_lens.append(d)
        total += d
    if total <= 0:
        return

    def point_at(dist):
        d = max(0.0, min(dist, total))
        acc = 0.0
        for i, s in enumerate(seg_lens):
            if acc + s >= d or i == len(seg_lens) - 1:
                if s <= 0:
                    return pts[i]
                t = (d - acc) / s
                x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t
                y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
                return (x, y)
            acc += s
        return pts[-1]

    fading = fade_length > 0 and len(color) == 4
    base_rgb = color[:3] if fading else None
    base_a = color[3] if fading else None

    pos = 0.0
    drawing = True
    while pos < total:
        step = dash_len if drawing else gap_len
        end = min(pos + step, total)
        if drawing:
            p0 = point_at(pos)
            p1 = point_at(end)
            if fading:
                dash_center = (pos + end) / 2.0
                alpha_mult = min(1.0, dash_center / fade_length)
                dash_alpha = int(base_a * alpha_mult)
                dash_color = base_rgb + (dash_alpha,)
            else:
                dash_color = color
            draw.line([p0, p1], fill=dash_color, width=int(round(width)))
        pos = end
        drawing = not drawing


def draw_arrowhead(draw, tip, direction, length, half_angle_deg, color):
    """Filled solid triangle arrowhead at `tip`, pointing along `direction`."""
    # Normalize direction
    dx, dy = direction
    mag = math.hypot(dx, dy)
    if mag == 0:
        return
    ux, uy = dx / mag, dy / mag

    # Base center is `length` behind the tip along -direction
    base_cx = tip[0] - ux * length
    base_cy = tip[1] - uy * length

    # Perpendicular unit vector
    px, py = -uy, ux

    # Base half-width from the half-angle
    half_w = length * math.tan(math.radians(half_angle_deg))

    left = (base_cx + px * half_w, base_cy + py * half_w)
    right = (base_cx - px * half_w, base_cy - py * half_w)

    draw.polygon([tip, left, right], fill=color)


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------
def render(scale, out_path):
    W = LOGICAL_W * scale
    H = LOGICAL_H * scale

    # -------- 1. Gradient background (direct target size) --------
    base = make_gradient(W, H, TOP_COLOR, BOTTOM_COLOR).convert("RGBA")

    # -------- 2. Title text (direct target size) --------
    title_draw = ImageDraw.Draw(base)
    font = load_title_font(TITLE_FONT_SIZE_PT * scale)
    # Measure text; use textbbox for accurate width
    bbox = title_draw.textbbox((0, 0), TITLE_TEXT, font=font)
    text_w = bbox[2] - bbox[0]
    text_x_offset = bbox[0]  # left-side bearing
    text_y_offset = bbox[1]  # top-side bearing
    # Center horizontally at x=300 (logical); align top of bbox to y_top=40
    x_center = 300 * scale
    y_top = TITLE_Y_TOP_PX * scale
    draw_x = x_center - text_w / 2 - text_x_offset
    draw_y = y_top - text_y_offset
    title_draw.text(
        (draw_x, draw_y),
        TITLE_TEXT,
        font=font,
        fill=TITLE_COLOR + (255,),
    )

    # -------- 3 & 4. Dashed rectangle + arrow on supersampled layer --------
    SS = SUPERSAMPLE
    ss_w = W * SS
    ss_h = H * SS
    ss_layer = Image.new("RGBA", (ss_w, ss_h), (0, 0, 0, 0))
    ss_draw = ImageDraw.Draw(ss_layer)

    # Effective scale from logical 600x400 to supersampled canvas
    L2SS = scale * SS

    # ---- Dashed rectangle ----
    rect_cx = APP_RECT_CENTER[0] * L2SS
    rect_cy = APP_RECT_CENTER[1] * L2SS
    rect_w = APP_RECT_W * L2SS
    rect_h = APP_RECT_H * L2SS
    rect_r = APP_RECT_CORNER_R * L2SS
    rect_stroke = APP_RECT_STROKE * L2SS
    rect_dash = APP_RECT_DASH * L2SS
    rect_gap = APP_RECT_GAP * L2SS
    rect_color = APP_RECT_COLOR + (APP_RECT_ALPHA,)

    rect_poly = rounded_rect_polyline(
        rect_cx, rect_cy, rect_w, rect_h, rect_r, corner_samples=28
    )
    draw_dashed_polyline(
        ss_draw, rect_poly, rect_dash, rect_gap, rect_color, rect_stroke, closed=True
    )

    # ---- Arrow curve (Catmull-Rom spline) ----
    arrow_ctrl_ss = [(p[0] * L2SS, p[1] * L2SS) for p in ARROW_CONTROL_POINTS]
    arrow_poly = catmull_rom_spline(arrow_ctrl_ss, samples_per_segment=120)
    arrow_stroke = ARROW_STROKE * L2SS
    arrow_dash = ARROW_DASH * L2SS
    arrow_gap = ARROW_GAP * L2SS
    arrow_color = ARROW_COLOR + (ARROW_ALPHA,)
    draw_dashed_polyline(
        ss_draw,
        arrow_poly,
        arrow_dash,
        arrow_gap,
        arrow_color,
        arrow_stroke,
        closed=False,
        fade_length=ARROW_FADE_LENGTH * L2SS,
    )

    # ---- Arrowhead at the tip ----
    tip = arrow_ctrl_ss[-1]
    prev = arrow_ctrl_ss[-2]
    direction = (tip[0] - prev[0], tip[1] - prev[1])
    draw_arrowhead(
        ss_draw,
        tip,
        direction,
        ARROWHEAD_LEN * L2SS,
        ARROWHEAD_HALF_ANGLE_DEG,
        arrow_color,
    )

    # ---- Downsample the supersampled layer ----
    ss_down = ss_layer.resize((W, H), Image.LANCZOS)

    # -------- Composite --------
    final = base.copy()
    final = Image.alpha_composite(final, ss_down)

    # Save as RGB (flatten alpha onto itself since base was opaque gradient)
    final_rgb = final.convert("RGB")
    final_rgb.save(out_path, "PNG", optimize=True)
    return final_rgb.size


def main():
    size_1x = render(scale=1, out_path=OUT_1X)
    size_2x = render(scale=2, out_path=OUT_2X)

    print(f"Wrote {OUT_1X}  size={size_1x}")
    print(f"Wrote {OUT_2X}  size={size_2x}")

    # Verification
    for p in (OUT_1X, OUT_2X):
        exists = os.path.exists(p)
        sz = os.path.getsize(p) if exists else -1
        with Image.open(p) as im:
            dim = im.size
        print(f"  {p}: exists={exists} bytes={sz} dims={dim}")


if __name__ == "__main__":
    main()
