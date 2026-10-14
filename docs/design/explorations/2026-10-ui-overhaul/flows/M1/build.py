#!/usr/bin/env python3
"""Build M1/index.html from src.html: embeds the full Oct 8 menu (every data-* field), places, events and photos.

Photos: build/<name>.jpg are produced by photos.sh (re-encoded, no retouching).
"""
import base64, json, os, re

D = os.path.dirname(os.path.abspath(__file__))
menu = json.load(open(os.path.join(D, '..', 'menu-full-2026-10-08.json')))

HK = {'Worcester': 'W', 'Franklin': 'F', 'Hampshire': 'H', 'Berkshire': 'B'}
MK = {'breakfast': 'breakfast', 'lunch': 'lunch', 'dinner': 'dinner', 'late night': 'late', 'grabngo': 'grab'}
ORDER = ['breakfast', 'lunch', 'dinner', 'late', 'grab']


def diet(s, code):
    # clean-diet-str has junk like 'Halal\r5', '\n', 'LPS' -> bitmask: 1 vegetarian, 2 plant based, 4 halal, 8 local, 16 sustainable
    parts = {re.sub(r'\r.*', '', p).strip() for p in s.split(',')}
    codes = set(code.split())
    return ((1 if 'Vegetarian' in parts or 'VGT' in codes else 0) | (2 if 'Plant Based' in parts or 'VGN' in codes else 0)
            | (4 if 'Halal' in parts or 'H' in codes else 0) | (8 if 'Local' in parts or 'LPR' in codes else 0) | (16 if 'SUS' in codes else 0))


def station(s):
    s = re.sub(r"^Grab n'Go\s+", '', s)
    s = re.sub(r'(\s+(WOR|FRK|HMP|BRK))+$', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def num(v):  # "685.5mg" -> 685.5 ; "" -> None
    m = re.match(r'\s*([\d.]+)', v or '')
    return float(m.group(1)) if m else None


def dv(v):
    return int(v) if (v or '').strip().isdigit() else None


NUT = ['calories-from-fat', 'total-fat', 'total-fat-dv', 'sat-fat', 'sat-fat-dv', 'trans-fat', 'cholesterol', 'sodium', 'sodium-dv',
       'total-carb', 'total-carb-dv', 'dietary-fiber', 'dietary-fiber-dv', 'sugars', 'protein', 'protein-dv']


def dish(x):
    n = [dv(x[k]) if k.endswith('-dv') else num(x[k]) for k in NUT]
    hf = x.get('healthfulness', '')
    return [x['dish-name'].strip(), round(num(x['calories']) or 0), round(num(x['protein']) or 0, 1), round(num(x['total-carb']) or 0, 1),
            round(num(x['total-fat']) or 0, 1), diet(x['clean-diet-str'], x['recipe-webcode']), x['serving-size'].strip().lower(),
            n, re.sub(r'\s+', ' ', x['ingredient-list']).strip(), re.sub(r'\s*,\s*', ', ', x['allergens']).strip(' ,'),
            int(hf) // 10 if hf.isdigit() else None, x['carbon-list'] if x['carbon-list'] in 'ABCDE' and x['carbon-list'] else None]


out = {}
for hall, meals in menu['halls'].items():
    h = HK[hall]
    out[h] = {}
    for mk in sorted(meals, key=lambda m: ORDER.index(MK[m])):
        out[h][MK[mk]] = [[station(s['station']), [dish(x) for x in s['dishes']]] for s in meals[mk]]

# sanity: the benchmark plate at Worcester lunch is 404 cal / 38.9 g protein; Golden BBQ's label is complete
w = {x[0]: x for st in out['W']['lunch'] for x in st[1]}
b, g = w['Beef Brisket Noodle Bowl'], w['Golden BBQ Chicken Thigh']
assert b[1] + 2 * g[1] == 404 and round(b[2] + 2 * g[2], 1) == 38.9, (b, g)
assert g[7][NUT.index('sodium')] == 685.5 and g[7][NUT.index('sodium-dv')] == 30 and g[10] == 3 and g[11] == 'C', g

# ---- places: real hours/descriptions/payment/menus from uapp/get_infov2 ----
locs = {x['location_title']: x for x in json.load(open(os.path.join(D, '..', 'locations-2026-10-08.json')))}
def mins(t):
    hh, mm = map(int, t[:5].split(':')); ap = t[-2:]
    return (hh % 12 + (12 if ap == 'PM' else 0)) * 60 + mm
AREAS = ['Campus Center', 'North, by Worcester', 'Library and academic core', 'Southwest, by Hampshire and Berkshire']
CAFES = {  # name -> (area, building); Newton campus, babyBerk trucks, Terrace and The Commonwealth Restaurant left out
    'Paciugo': (0, 'Campus Center'), 'Tavola': (0, 'Campus Center'), 'Yum! Bakery': (0, 'Blue Wall, Campus Center'),
    'Green Fields': (0, 'Blue Wall, Campus Center'), 'Tamales': (0, 'Blue Wall, Campus Center'), 'Wasabi': (0, 'Blue Wall, Campus Center'),
    'Deli Delish': (0, 'Blue Wall, Campus Center'), 'Star Ginger': (0, 'Blue Wall, Campus Center'), 'The Grill': (0, 'Blue Wall, Campus Center'),
    "People's Organic Coffee": (0, 'Campus Center concourse'), 'Harvest Market': (0, 'Campus Center concourse'), 'UMass Store': (0, 'Campus Center, 2nd floor'),
    'Worcester Café': (1, 'Worcester Commons'), 'ISB Café': (1, 'Integrated Science Building'), 'Morrill Café': (1, 'Morrill 2'),
    'Snack Overflow': (1, 'Manning CICS'), 'The Hub': (1, 'Furcolo Hall'), 'Newman Café': (1, 'Newman Center'), 'Peet’s Coffee & Tea': (1, 'Integrated Learning Center'),
    'Procrastination Station': (2, 'Du Bois Library'), 'Whitmore Café': (2, 'Whitmore Building'), 'Carney Café': (2, 'Isenberg'),
    'Post & Bean Café': (2, 'Olver Design Building'),
    'Hampshire Café': (3, 'Hampshire Dining Commons'), 'Argo Tea': (3, 'Hampden'), 'Roots Café': (3, 'Honors College'), 'Courtside Café': (3, 'Recreation Center'),
}
places = []
for n, (area, bld) in CAFES.items():
    x = locs[n]
    items = json.loads(x['menu']) if x.get('menu') else []
    places.append([n.replace('’', "'"), area, bld, mins(x['opening_hours']), mins(x['closing_hours']), x['accepted_payment'], x['short_description'].strip(), items])
assert len(places) == 27
HALLLOC = {'W': 'Worcester Commons', 'F': 'Franklin Dining Commons', 'H': 'Hampshire Dining Commons', 'B': 'Berkshire Dining Commons'}
hours = {h: [mins(locs[n]['opening_hours']), mins(locs[n]['closing_hours'])] for h, n in HALLLOC.items()}
grab = {h: [mins(locs[HN + ' Grab ‘N Go']['opening_hours']), mins(locs[HN + ' Grab ‘N Go']['closing_hours'])] for h, HN in
        {'W': 'Worcester', 'F': 'Franklin', 'H': 'Hampshire', 'B': 'Berkshire'}.items()}
# Events: drop expired ones, merge "<X> Hours" into "<X>" (one holiday, one card), soonest first, evergreen last.
EVSCOPE = {'Indigenous Peoples Day': 'WFHB'}  # flyer: "October 12th, 5:00-9:00 PM, all DCs" (not in the feed)
EVIMG = {'Indigenous Peoples Day': 'ipd', 'October Event': 'oct', 'Pete and Gerry': 'pg', 'Sustainability is on the menu': 'sust'}
NOW_TS = 1791477600  # Thu Oct 8 2026 12:40 EDT
raw = [e for e in json.load(open(os.path.join(D, '..', 'events-2026-10-08.json'))) if e['expiration_date'] > NOW_TS]
byt = {e['title'].strip(): e for e in raw}
events = []
for t, e in byt.items():
    if t.endswith(' Hours') and t[:-6] in byt:
        continue
    links = []
    if e['pdf_link']: links.append(['See the menu' if t + ' Hours' in byt else 'Open the flyer', e['pdf_link']])
    if e['external_link']: links.append(['Open the link', e['external_link']])
    h = byt.get(t + ' Hours')
    if h: links.append(['Holiday hours', h['external_link'] or h['pdf_link']])
    events.append([t, e['expiration_date'], links, EVIMG.get(t), EVSCOPE.get(t, '')])
events.sort(key=lambda e: e[1])
assert [e[0] for e in events][0] == 'Indigenous Peoples Day' and len(events) == 4
PLACES = {'areas': AREAS, 'places': places, 'hours': hours, 'grab': grab, 'events': events}

src = open(os.path.join(D, 'src.html')).read()
src = src.replace('__PLACES__', json.dumps(PLACES, separators=(',', ':'), ensure_ascii=False))
src = src.replace('__MENU__', json.dumps(out, separators=(',', ':'), ensure_ascii=False))
for name, key in [('worcester', 'W'), ('franklin', 'F'), ('hampshire', 'H'), ('berkshire', 'B'), ('worcester-food', 'S'), ('ev-ipd', 'EV_ipd'), ('ev-oct', 'EV_oct'), ('ev-pg', 'EV_pg'), ('ev-sust', 'EV_sust')]:
    b64 = base64.b64encode(open(os.path.join(D, 'build', name + '.jpg'), 'rb').read()).decode()
    src = src.replace('__IMG_%s__' % key, 'data:image/jpeg;base64,' + b64)
open(os.path.join(D, 'index.html'), 'w').write(src)
print('index.html', os.path.getsize(os.path.join(D, 'index.html')), 'bytes')
