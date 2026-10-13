# For every recorded M2 interaction: the largest share of near-white pixels in any frame, against the larger of the
# first and last frames. A transition that "flashes" white shows up as a positive excess.
import json, os, sys
from PIL import Image
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', 'rec', sys.argv[1] if len(sys.argv) > 1 else 'M2')
def w(f):
    im = Image.open(f).convert('L').resize((65, 140)); d = list(im.get_flattened_data()); return sum(v > 236 for v in d) / len(d)
rows = []
for n in sorted(os.listdir(D)):
    m = os.path.join(D, n, 'times.json')
    if not os.path.exists(m): continue
    fr = json.load(open(m))['frames']
    if not fr: continue
    ws = [w(os.path.join(D, n, f[0])) for f in fr[::2]]
    rows.append((max(ws) - max(ws[0], ws[-1]), n, max(ws), ws[0], ws[-1]))
for r in sorted(rows, reverse=True): print(f'{r[1]:16s} excess {r[0]*100:5.1f}%  peak {r[2]*100:4.0f}%  start {r[3]*100:4.0f}%  end {r[4]*100:4.0f}%')
