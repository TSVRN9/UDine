# Builds index.html from src.html + the real menu JSON (lunch for all 4 halls, plus macro
# snapshots for the seeded on-device history). Run: python3 build.py
import json, os, re
here = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(here, '..', 'menu-2026-10-08.json')))

def clean(s): return ', '.join(t.strip() for t in s.replace('\r6', '').split(',') if t.strip() and t.strip() != 'None')

menu = {}
for h, meals in d['halls'].items():
    menu[h] = [[re.sub(r'\s+\d+$', '', s['station'].replace('  WOR', '').replace(' FRK HMP', '').strip()),
                [[x['name'], round(x['cal']), x['protein'], x['carbs'], x['fat'], x['serving'], clean(x['diet'])]
                 for x in s['dishes']]] for s in meals['lunch']]

def snap(hall, meal, name, q):
    for s in d['halls'][hall][meal]:
        for x in s['dishes']:
            if x['name'] == name: return [name, q, round(x['cal']), x['protein'], x['carbs'], x['fat']]
    raise SystemExit(f'missing {hall}/{meal}/{name}')

W, F, H = 'Worcester', 'Franklin', 'Hampshire'
B, T, BR = 'Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'breakfast'
# (date, meal, hall, time, [(menu-meal, name, qty)])  -- menus repeat on rotation, so today's
# real menus stand in for the macros of past days.
plan = [
    ('2026-10-08', BR, W, '8:52', [(BR, 'Scrambled Eggs', 1), (BR, 'Red Potato Home Fries', 1), (BR, 'Masala Chai', 1), (BR, 'Mini Apple Danish', 1)]),
    ('2026-10-07', 'dinner', W, '18:20', [('dinner', 'Chicken Shawarma', 1), ('dinner', 'Turmeric Basmati Rice', 1)]),
    ('2026-10-07', 'lunch', H, '12:15', [('lunch', 'California Roll', 1), ('lunch', 'Mussaman Curry (Chicken)', 1)]),
    ('2026-10-06', 'lunch', W, '12:48', [('lunch', B, 1), ('lunch', T, 2)]),
    ('2026-10-06', BR, W, '9:05', [(BR, 'Scrambled Eggs', 1), (BR, 'Masala Chai', 1)]),
    ('2026-10-05', 'dinner', F, '18:40', [('dinner', 'Cheese Pizza', 2)]),
    ('2026-10-05', 'lunch', W, '13:02', [('lunch', T, 2), ('lunch', 'Halal French Fries', 1)]),
    ('2026-10-02', 'lunch', F, '12:30', [('lunch', 'Cheese Pizza', 2), ('lunch', 'Zebra Brownies', 1)]),
    ('2026-10-01', 'dinner', W, '18:10', [('dinner', 'Chicken Shawarma', 1), ('dinner', 'Kimchi Fried Rice', 1)]),
    ('2026-10-01', 'lunch', W, '12:40', [('lunch', B, 1), ('lunch', T, 2), ('lunch', 'Oatmeal Raisin Cookie', 1)]),
    ('2026-09-30', 'lunch', H, '12:20', [('lunch', 'California Roll', 1), ('lunch', 'Vegetable Fried Rice', 1)]),
    ('2026-09-29', 'lunch', W, '12:55', [('lunch', B, 1), ('lunch', 'Zebra Brownies', 1)]),
    ('2026-09-28', 'dinner', W, '18:30', [('dinner', 'Chicken Shawarma', 1)]),
    ('2026-09-28', 'lunch', H, '12:10', [('lunch', 'California Roll', 1)]),
    ('2026-09-25', 'lunch', W, '12:35', [('lunch', T, 2), ('lunch', 'Hand Cut Sweet Potato Fries', 1)]),
]
seed = [{'d': dt, 'meal': m, 'hall': h, 't': t, 'items': [snap(h, mm, n, q) for mm, n, q in items]}
        for dt, m, h, t, items in plan]

src = open(os.path.join(here, 'src.html')).read()
out = src.replace('/*MENU*/null', json.dumps(menu, separators=(',', ':'))) \
         .replace('/*SEED*/null', json.dumps(seed, separators=(',', ':')))
open(os.path.join(here, 'index.html'), 'w').write(out)
print('index.html', len(out.encode()), 'bytes')
