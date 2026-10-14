import json
from PIL import Image
L = lambda c: sum(w * ((v / 255) / 12.92 if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4) for w, v in zip((0.2126, 0.7152, 0.0722), c[:3]))
B = json.load(open('build/ct/boxes.json'))
for k, boxes in B.items():
    im = Image.open(f'build/ct/{k}.png').convert('RGB'); worst = {}
    for name, a, x0, y0, x1, y1 in boxes:
        if x1 <= x0 or y1 <= y0: continue
        mx = max(L(im.getpixel((x, y))) for x in range(max(0, x0), min(390, x1)) for y in range(max(0, y0), min(844, y1)))
        kind = 'large (3:1)' if a == 1 else 'small (4.5:1)'
        worst[kind] = min(worst.get(kind, 99), (a + (1 - a) * mx + .05) / (mx + .05))
    print(k, {n: round(v, 1) for n, v in worst.items()})
