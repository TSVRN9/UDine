#!/usr/bin/env python3
"""Contact sheets from rec.js output.
  python3 sheet.py strip <ver> <name> [step_ms] [crop x,y,w,h]   -> build/rec/strip-<ver>-<name>.png
  python3 sheet.py compare <name> [step_ms] [crop]                  -> compare-<name>.png (M1 on top, M2 below)
Frames are picked at fixed app-time steps (default 33 ms = every 2nd frame at 60 fps), starting 1 step before the tap."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

D = os.path.dirname(os.path.abspath(__file__))
TW = 240
try:
    FONT = ImageFont.truetype('/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf', 15)
except OSError:
    FONT = ImageFont.load_default()


def pick(ver, name, step, crop):
    d = os.path.join(D, 'build', 'rec', ver, name)
    meta = json.load(open(os.path.join(d, 'times.json')))
    fr = meta['frames']
    if not fr:
        return []
    end = fr[-1][1]
    out, t = [], -step
    while t <= end + 1:
        f = min(fr, key=lambda x: abs(x[1] - t))
        im = Image.open(os.path.join(d, f[0])).convert('RGB')
        if crop:
            im = im.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        w = TW if not crop else min(TW * 2, crop[2])
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        out.append((im, f[1]))
        t += step
    return out


def row(frames, label):
    if not frames:
        return Image.new('RGB', (400, 60), 'white')
    w, h = frames[0][0].size
    per = max(1, 3200 // (w + 6))
    rows = (len(frames) + per - 1) // per
    img = Image.new('RGB', (min(len(frames), per) * (w + 6) + 70, rows * (h + 26)), (236, 236, 236))
    dr = ImageDraw.Draw(img)
    dr.text((8, 8), label, fill=(0, 0, 0), font=FONT)
    for i, (im, t) in enumerate(frames):
        x, y = 70 + (i % per) * (w + 6), (i // per) * (h + 26)
        img.paste(im, (x, y))
        dr.text((x + 4, y + h + 4), f'{t:+.0f} ms', fill=(0, 0, 0), font=FONT)
    return img


def stack(imgs):
    W = max(i.width for i in imgs)
    out = Image.new('RGB', (W, sum(i.height for i in imgs) + 20 * (len(imgs) - 1)), (120, 120, 120))
    y = 0
    for i in imgs:
        out.paste(i, (0, y)); y += i.height + 20
    return out


if __name__ == '__main__':
    mode = sys.argv[1]
    if mode == 'strip':
        ver, name = sys.argv[2], sys.argv[3]
        step = float(sys.argv[4]) if len(sys.argv) > 4 else 33.3
        crop = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else None
        row(pick(ver, name, step, crop), ver).save(os.path.join(D, 'build', 'rec', f'strip-{ver}-{name}.png'))
    else:
        name = sys.argv[2]
        step = float(sys.argv[3]) if len(sys.argv) > 3 else 33.3
        crop = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
        vs = [v for v in ('M1', 'M2r1', 'M2r2', 'M2r3', 'M2r4', 'M2') if os.path.exists(os.path.join(D, 'build', 'rec', v, name, 'times.json'))]
        lab = {'M2r1': 'M2 r1', 'M2r2': 'M2 r2', 'M2r3': 'M2 r3', 'M2r4': 'M2 r4', 'M2': 'M2 now'}
        stack([row(pick(v, name, step, crop), lab.get(v, v)) for v in vs]).save(os.path.join(D, f'compare-{name}.png'))
