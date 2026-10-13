# Emits the compact lunch data embedded in index.html (lunch for 4 halls only).
import json, sys, re
d = json.load(open(sys.argv[1]))
out = []
for h in ['Worcester', 'Franklin', 'Hampshire', 'Berkshire']:
    sts = []
    for st in d['halls'][h]['lunch']:
        rows = []
        for x in st['dishes']:
            dt = x['diet'] or ''
            fl = ('P' if 'Plant Based' in dt else '') + ('V' if 'Vegetarian' in dt or 'Plant Based' in dt else '') + ('H' if 'Halal' in dt else '')
            rows.append([x['name'], x['serving'].strip(), round(x['cal']), x['protein'], x['carbs'], x['fat'], fl])
        sts.append([re.sub(r"(\s+\d+)?(\s+(WOR|FRK|HMP))+$", "", st["station"].strip()), rows])
    out.append(sts)
print('const MENU=' + json.dumps(out, separators=(',', ':')) + ';')
