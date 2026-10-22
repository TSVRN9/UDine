#!/usr/bin/env python3
"""Writes the launcher icons: a white U with six copies stepping off it diagonally, gold darkening into the maroon ground.
Android gets adaptive layers (ground, trail, and the white U alone as the themed-icon mask) plus legacy round icons for API 24-25;
iOS gets one 1024 square without alpha (App Store Connect rejects an icon with an alpha channel).
The 1024 square is Android's 108dp adaptive canvas, so the launcher shows its centre 0.667 (the 72dp mask).
Run: python3 tool/gen_icon.py (needs rsvg-convert and Pillow)"""
import pathlib, subprocess, tempfile
from PIL import Image, ImageDraw

root = pathlib.Path(__file__).resolve().parent.parent
N = 1024
GOLD, CHALK, LINE = "#c99a2e", "#f8f9fb", "#6e1518"

def ground():
    return (f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a2222"/>'
            f'<stop offset="1" stop-color="#6e1518"/></linearGradient></defs><rect width="{N}" height="{N}" fill="url(#g)"/>')

def upath(cx, top, w, h, sw):
    """A U as one stroke: two straight stems and a true half-circle bowl. cx centre, top = stem tops, w = outer width."""
    r = (w - sw) / 2
    xl, xr, yb = cx - r, cx + r, top + h - sw / 2 - r
    return f"M{xl:.1f},{top:.1f} V{yb:.1f} A{r:.1f},{r:.1f} 0 0 0 {xr:.1f},{yb:.1f} V{top:.1f}"

def stroke(d, color, sw):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw:.1f}" stroke-linecap="butt"/>'

def mix(a, b, t):
    A = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; B = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(A[i] + (B[i] - A[i]) * t):02x}" for i in range(3))

def trail(copies=True, hero=CHALK, outline=True, n=6, step=41, w=380, h=416, sw=120, line=10, drop=28):
    """The hero U centred (dropped by `drop`: a round bowl under flat stem tops reads high when centred by its box); copies step
    down-right off the edge, each cut out by a ground-coloured line, never showing through the hero's counter."""
    cx, top = N / 2, N / 2 - h / 2 + drop
    r = (w - sw) / 2
    out = []
    if copies:
        cl, cr, cb = cx - r + sw / 2, cx + r - sw / 2, top + h - sw / 2 - r
        out.append(f'<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="{N}" height="{N}"><rect width="{N}" height="{N}" fill="#fff"/>'
                   f'<rect x="{cl:.1f}" y="0" width="{cr - cl:.1f}" height="{cb:.1f}" fill="#000"/>'
                   f'<circle cx="{cx:.1f}" cy="{cb:.1f}" r="{r - sw / 2:.1f}" fill="#000"/></mask><g mask="url(#m)">')
        for k in range(n, 0, -1):
            d = upath(cx + k * step, top + k * step, w, h, sw)
            out.append(stroke(d, LINE, sw + 2 * line) + stroke(d, mix(GOLD, "#7a2a1c", (k - 1) / (n - 1) * 0.9), sw))
        out.append("</g>")
    d = upath(cx, top, w, h, sw)
    out.append((stroke(d, LINE, sw + 2 * line) if outline else "") + stroke(d, hero, sw))
    return "".join(out)

def png(body, size, path):
    with tempfile.NamedTemporaryFile("w", suffix=".svg") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{N}" height="{N}" viewBox="0 0 {N} {N}">{body}</svg>'); f.flush()
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), f.name, "-o", str(path)], check=True)

res = root / "android/app/src/main/res"
for dpi, s in {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}.items():
    d = res / f"mipmap-{dpi}"
    png(ground(), round(108 * s), d / "ic_launcher_background.png")
    png(trail(), round(108 * s), d / "ic_launcher_foreground.png")
    png(trail(copies=False, outline=False), round(108 * s), d / "ic_launcher_monochrome.png")
    # legacy (API 24-25): the adaptive canvas's centre 72dp, round
    size = round(48 * s)
    png(ground() + trail(), round(108 * s), d / "ic_launcher.png")
    im = Image.open(d / "ic_launcher.png").convert("RGBA")
    cut = (im.width - round(72 * s)) // 2
    im = im.crop((cut, cut, im.width - cut, im.height - cut)).resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4)); ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    im.save(d / "ic_launcher.png")

ios = root / "ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png"
png(ground() + trail(), N, ios)
Image.open(ios).convert("RGB").save(ios)
