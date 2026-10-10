# Diffs the endpoint pairs written by endpoints.js: % of pixels that differ (>24/255) and where.
# Expected: before vs p0 and p1 vs rest are anti-aliasing only (scaled title, photo resampling, <0.3%).
# open0 vs closed differs only in the Cafés & markets area rows, which re-sort (nearest area first) while the menu covers Halls.
from PIL import Image, ImageChops
D = 'build/ep/'
for h in 'WFHB':
    for a, b in [(f'no-preference-before-{h}', f'no-preference-p0-{h}'), (f'no-preference-p1-{h}', f'no-preference-rest-{h}'),
                 (f'no-preference-open0-{h}', f'no-preference-closed-{h}'), (f'reduce-open0-{h}', f'reduce-closed-{h}')]:
        d = ImageChops.difference(Image.open(D + a + '.png').convert('RGB'), Image.open(D + b + '.png').convert('RGB')).convert('L').point(lambda v: 255 if v > 24 else 0)
        n = sum(1 for v in d.get_flattened_data() if v) if hasattr(d, 'get_flattened_data') else sum(1 for v in d.getdata() if v)
        print(f'{a:30s} vs {b:30s} {n / (d.width * d.height) * 100:6.3f}%  region {d.getbbox()}')
