// Builds index.html from src.html + lunch data in ../menu-2026-10-08.json
const fs = require('fs');
const src = JSON.parse(fs.readFileSync(__dirname + '/../menu-2026-10-08.json', 'utf8'));
const HALLS = ['Worcester', 'Franklin', 'Hampshire', 'Berkshire'];
const clean = s => s.replace(/\s+/g, ' ').trim();
const station = s => clean(s).replace(/^Latino.*$/, 'Latino').replace(/ WOR$| FRK HMP$/, '');
const diet = s => {
  const t = s.toLowerCase();
  return (t.includes('halal') ? 'h' : '') + (t.includes('plant based') ? 'p' : '') + (t.includes('vegetarian') ? 'v' : '') + (t.includes('local') ? 'l' : '');
};
// rows: [hallIdx, station, name, cal, p, c, f, diet, serving]
const rows = [];
HALLS.forEach((h, hi) => {
  for (const st of src.halls[h].lunch) for (const d of st.dishes)
    rows.push([hi, station(st.station), clean(d.name), d.cal, d.protein, d.carbs, d.fat, diet(d.diet), clean(d.serving || '')]);
});
// breakfast seed for today's earlier log: Hampshire breakfast, first two real items
const bf = [];
for (const st of src.halls.Hampshire.breakfast) for (const d of st.dishes) bf.push([clean(d.name), d.cal, d.protein, d.carbs, d.fat]);
const data = { rows };
const html = fs.readFileSync(__dirname + '/src.html', 'utf8').replace('/*DATA*/null', JSON.stringify(data));
fs.writeFileSync(__dirname + '/index.html', html);
// sanity: benchmark plate from source
const find = (n, h) => rows.find(r => r[2] === n && r[0] === h);
const g = find('Golden BBQ Chicken Thigh', 0), b = find('Beef Brisket Noodle Bowl', 0);
const cal = g[3] * 2 + b[3], pro = Math.round((g[4] * 2 + b[4]) * 10) / 10;
if (cal !== 404 || pro !== 38.9) throw new Error('plate math ' + cal + ' ' + pro);
console.log('ok', rows.length, 'rows', html.length, 'bytes', 'carbs', g[5] * 2 + b[5], 'fat', g[6] * 2 + b[6]);
