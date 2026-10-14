#!/usr/bin/env python3
"""Build M1/index.html from src.html: embeds the full Oct 8 menu (every data-* field), places, events and photos.

Photos: build/<name>.jpg are produced by photos.sh (re-encoded, no retouching).
"""
import base64, json, os, re

D = os.path.dirname(os.path.abspath(__file__))
MENUS = json.load(open(os.path.join(D, '..', 'menus-2026-10-08-to-22.json')))

HK = {'Worcester': 'W', 'Franklin': 'F', 'Hampshire': 'H', 'Berkshire': 'B'}
MK = {'breakfast': 'breakfast', 'lunch': 'lunch', 'dinner': 'dinner', 'late night': 'late', 'daily offerings': 'all', 'grabngo': 'grab'}
ORDER = ['breakfast', 'lunch', 'dinner', 'late', 'all', 'grab']


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


# the feed's allergen values, in the order Dietary preferences lists them (the US "big nine", then gluten and corn)
ALG = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame', 'Gluten', 'Corn']


def allergens(v):  # "Milk, Eggs, Gluten, Soy, Corn  , Wheat" -> "Milk, Eggs, Gluten, Soy, Corn, Wheat"; blank -> "" (not listed, not "none")
    parts = [p.strip() for p in (v or '').split(',') if p.strip()]
    assert all(p in ALG for p in parts), parts
    return ', '.join(parts)


def dish(x):
    g = lambda k: x.get(k) or ''
    n = [dv(g(k)) if k.endswith('-dv') else num(g(k)) for k in NUT]
    # scored = the legend code H0..H7 in recipe-webcode (as umassdining.com draws its badges); data-healthfulness alone is
    # not trusted: 16 Oct 8 dishes carry a value with no H code (unscored). H0 is a real 0. Carbon: the letter, which
    # always matches its CR1..CR5 code.
    hc = [int(c[1]) for c in g('recipe-webcode').split() if re.fullmatch(r'H[0-7]', c)]
    cr = g('carbon-list')
    return [g('dish-name').strip(), round(num(g('calories')) or 0), round(num(g('protein')) or 0, 1), round(num(g('total-carb')) or 0, 1),
            round(num(g('total-fat')) or 0, 1), diet(g('clean-diet-str'), g('recipe-webcode')), g('serving-size').strip().lower(),
            n, re.sub(r'\s+', ' ', g('ingredient-list')).strip(), allergens(g('allergens')),
            hc[0] if hc else None, cr if cr in ('A', 'B', 'C', 'D', 'E') else None, x.get('price') or None,
            # the feed's raw data-healthfulness, kept only for vectors.js (a number with no H code is unscored and never drawn)
            int(num(g('healthfulness'))) if num(g('healthfulness')) is not None else None]


# ---- places: real hours/descriptions/payment/menus from uapp/get_infov2 ----
locs = {x['location_title']: x for x in json.load(open(os.path.join(D, '..', 'locations-2026-10-08.json')))}
def mins(t):
    hh, mm = map(int, t[:5].split(':')); ap = t[-2:]
    return (hh % 12 + (12 if ap == 'PM' else 0)) * 60 + mm
AREAS = ['Campus Center', 'North, by Worcester', 'Library and academic core', 'Southwest, by Hampshire and Berkshire', 'Charles River Campus, Newton']
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
    # round 9b (owner): Terrace is on campus (42.3834, -72.5273, south of Hampshire Commons) though UMass files it as off campus.
    # Charles River is the Newton campus: area 4, shown only when You's Charles River Campus toggle is on. Both go last, so no
    # earlier place's key (c<i>) moves.
    'Terrace': (3, 'Fieldstone Apartments'), 'Charles River Campus of UMass Amherst': (4, 'Newton'),
}
SHORT = {'Charles River Campus of UMass Amherst': 'Charles River Campus'}   # the name the app shows
places = []
for n, (area, bld) in CAFES.items():
    x = locs[n]
    items = json.loads(x['menu']) if x.get('menu') else []
    places.append([SHORT.get(n, n).replace('’', "'"), area, bld, mins(x['opening_hours']), mins(x['closing_hours']), x['accepted_payment'], x['short_description'].strip(), items])
assert len(places) == 29
TITLE = {SHORT.get(n, n).replace('’', "'"): n for n in CAFES}   # place name -> the feed's location_title
HALLLOC = {'W': 'Worcester Commons', 'F': 'Franklin Dining Commons', 'H': 'Hampshire Dining Commons', 'B': 'Berkshire Dining Commons'}
hours = {h: [mins(locs[n]['opening_hours']), mins(locs[n]['closing_hours'])] for h, n in HALLLOC.items()}
grab = {h: [mins(locs[HN + ' Grab ‘N Go']['opening_hours']), mins(locs[HN + ' Grab ‘N Go']['closing_hours'])] for h, HN in
        {'W': 'Worcester', 'F': 'Franklin', 'H': 'Hampshire', 'B': 'Berkshire'}.items()}

# ---- menus, Oct 8-22 (round 9): halls and the cafés with dish menus ----
# Place keys: the hall letters, and 'c<i>' for P.places[i]. Charles River (the Newton campus) and Terrace (Fieldstone
# Apartments) are in the feed but not in M2's places, as in every earlier round (owner, round 9).
rk = lambda n: n.replace('’', "'").replace('‘', "'").lower()
PKEY = {rk(n): h for n, h in HK.items()}
PKEY.update({rk(TITLE[p[0]]): 'c%d' % i for i, p in enumerate(places)})
DAYS = sorted(MENUS['days'])
assert DAYS[0] == '2026-10-08' and DAYS[-1] == '2026-10-22' and len(DAYS) == 15
used, MD = {}, []
for iso in DAYS:
    day = {}
    for loc, meals in MENUS['days'][iso].items():
        key = PKEY[rk(loc)]
        day[key] = {}
        for mk in sorted(meals, key=lambda m: ORDER.index(MK[m])):
            day[key][MK[mk]] = [[station(st), [used.setdefault(i, len(used)) for i in ids]] for st, ids in meals[mk]]
    MD.append(day)
DISHES = [None] * len(used)
for i, j in used.items(): DISHES[j] = dish(MENUS['dishes'][i])
CAFEMENU = sorted({k for d in MD for k in d if k[0] == 'c'}, key=lambda k: int(k[1:]))
assert len(CAFEMENU) == 18, CAFEMENU
assert MD[2] == {}, 'Oct 10 is empty everywhere'

# sanity: the benchmark plate at Worcester lunch is 404 cal / 38.9 g protein; Golden BBQ's label is complete
w = {DISHES[x][0]: DISHES[x] for st in MD[0]['W']['lunch'] for x in st[1]}
b, g = w['Beef Brisket Noodle Bowl'], w['Golden BBQ Chicken Thigh']
assert b[1] + 2 * g[1] == 404 and round(b[2] + 2 * g[2], 1) == 38.9, (b, g)
assert g[7][NUT.index('sodium')] == 685.5 and g[7][NUT.index('sodium-dv')] == 30 and g[10] == 3 and g[11] == 'C' and g[12] is None, g
assert sum(1 for d in {(x[0], x[13], x[10]) for x in DISHES} if d[1] is not None and d[2] is None) >= 16, 'the unscored-with-a-number dishes'
assert any(DISHES[x][0] == 'Green Chile Posole' for st in MD[1]['H']['lunch'] for x in st[1])
assert 'breakfast' not in MD[3]['F'], 'Franklin, Sunday: no breakfast'

# ---- meal windows (round 9): shared/src/hours.ts. No hall publishes per-meal times, so each meal is
# STANDARD_MEAL_WINDOWS clamped to the place's general hours (effectiveMealWindow). Unlike effectiveMealWindow, the clamp is
# applied whatever the clock says, because M2 also needs later today and tomorrow. Late night runs to the 2 AM rollover
# before the clamp. Grab 'N Go keeps its own hours; a café's all-day menu and its Grab 'N Go are its general hours.
STD = {'breakfast': (420, 660), 'lunch': (660, 990), 'dinner': (990, 1260), 'late': (1260, 1440 + 120)}
def clamp(w, o, c):
    a, b = max(w[0], o), min(w[1], c)
    return [a, b] if a < b else None
WIN = {}
for h, n in HALLLOC.items():
    o, c = hours[h]
    WIN[h] = {m: clamp(w, o, c) for m, w in STD.items()}
    WIN[h]['grab'] = grab[h]
for k in CAFEMENU:
    p = places[int(k[1:])]; o, c = p[3], p[4]
    WIN[k] = {m: clamp(w, o, c) for m, w in STD.items()}
    WIN[k]['all'] = WIN[k]['grab'] = [o, c]
assert WIN['W']['lunch'] == [660, 990] and WIN['B']['breakfast'] is None and WIN['F']['late'] is None and WIN['W']['late'] == [1260, 1439]

# ---- where (round 9): the street line of get_infov2's address and its map_address, from the Oct 11 snapshot (all 39
# locations carry one; the Oct 8 capture has none). parseStreetAddress / parseMapAddress in shared/src/hours.ts.
L11 = {rk(x['location_title']): x for x in json.load(open(os.path.join(D, '..', 'locations-2026-10-11.json')))}
# Procrastination Station is missing from the Oct 11 snapshot (closed that Sunday). Its address and map_address are the Oct 8
# raw get_infov2 capture's (local/photos/raw/infov2.json, gitignored), copied here so the build needs nothing outside flows/.
L11.setdefault('procrastination station', {'address': '<p>W.E.B. Du Bois Library<br/>154 Hicks Way<br/>Amherst, MA 01003</p>', 'map_address': '42.389757,-72.528169'})
def street(html):
    t = re.sub(r'<br\s*/?>', '\n', html or '', flags=re.I); t = re.sub(r'<[^>]+>', '', t)
    return t.split('\n')[0].strip()
ADDR = {}
for key, title in list(HALLLOC.items()) + [('c%d' % i, TITLE[p[0]]) for i, p in enumerate(places)]:
    x = L11[rk(title)]
    m = (x.get('map_address') or '').strip()
    assert re.fullmatch(r'-?\d+(\.\d+)?,-?\d+(\.\d+)?', m), (title, m)
    ADDR[key] = [street(x['address']), m]
assert ADDR['W'] == ['667 N Pleasant St', '42.3924624,-72.5255959'], ADDR['W']

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
    events.append([t, e['expiration_date'], links, EVIMG.get(t), EVSCOPE.get(t, ''), byt[t + ' Hours']['title'].strip() if h else None])   # [5]: the merged hours event's own title
events.sort(key=lambda e: e[1])
assert [e[0] for e in events][0] == 'Indigenous Peoples Day' and len(events) == 4
# Retail photos: UMass Dining's own location-card photos (assets/retail/index.json maps name -> file + source URL),
# re-encoded to JPEG q80 in build/retail by photos.sh-equivalent below; no retouching. Keyed by place name, and 'grab:W' etc.
RIDX = json.load(open(os.path.join(D, 'assets', 'retail', 'index.json')))
RBY = {rk(k): v for k, v in RIDX.items()}
def rimg(n):
    v = RBY.get(rk(n))
    if not v: return None
    f = os.path.join(D, 'build', 'retail', os.path.basename(v['file']).rsplit('.', 1)[0] + '.jpg')
    return 'data:image/jpeg;base64,' + base64.b64encode(open(f, 'rb').read()).decode()
RIMG = {p[0]: rimg(p[0]) for p in places}
# Charles River has no photo: get_infov2 carries no image field and umassdining.com's location cards (assets/retail) have none.
# None is invented; the app draws it on the band's own maroon ground.
assert [k for k, v in RIMG.items() if not v] == ['Charles River Campus'], [k for k, v in RIMG.items() if not v]
RIMG = {k: v for k, v in RIMG.items() if v}
for h, HNm in {'W': 'Worcester', 'F': 'Franklin', 'H': 'Hampshire', 'B': 'Berkshire'}.items():
    RIMG['grab:' + h] = rimg(HNm + " Grab 'N Go"); assert RIMG['grab:' + h]
PLACES = {'areas': AREAS, 'places': places, 'hours': hours, 'grab': grab, 'events': events}

src = open(os.path.join(D, 'src.html')).read()
src = src.replace('__PLACES__', json.dumps(PLACES, separators=(',', ':'), ensure_ascii=False))
src = src.replace('__RIMG__', json.dumps(RIMG, separators=(',', ':')))
J = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
for k, v in {'__DISHES__': DISHES, '__MD__': MD, '__DAYS__': DAYS, '__WIN__': WIN, '__ADDR__': ADDR, '__ALG__': ALG}.items():
    assert k in src, k
    src = src.replace(k, J(v))
for name, key in [('worcester', 'W'), ('franklin', 'F'), ('hampshire', 'H'), ('berkshire', 'B'), ('worcester-food', 'S'), ('ev-ipd', 'EV_ipd'), ('ev-oct', 'EV_oct'), ('ev-pg', 'EV_pg'), ('ev-sust', 'EV_sust')]:
    b64 = base64.b64encode(open(os.path.join(D, 'build', name + '.jpg'), 'rb').read()).decode()
    src = src.replace('__IMG_%s__' % key, 'data:image/jpeg;base64,' + b64)
open(os.path.join(D, 'index.html'), 'w').write(src)
print('index.html', os.path.getsize(os.path.join(D, 'index.html')), 'bytes')
