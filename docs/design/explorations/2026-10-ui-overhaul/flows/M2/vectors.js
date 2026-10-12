// Behaviour vectors for the bake-off builds (plan Task 1, step 4): node vectors.js -> vectors.json.
// It loads the built index.html and evaluates M2's own functions, so the RN and Flutter ports are checked against the
// prototype, not against a re-derivation. Run `python3 build.py` first.
//
// vectors.json:
// {
//   "clock": "2026-10-08T12:41:00-04:00",          // M2's fixed clock (NOW = 12:41)
//   "places": {"W": "Worcester", ..., "c3": "Green Fields", ...},   // authoritative: place keys are hall letters, 'c<i>'
//                                                     // for a café (c27 Terrace, c28 Charles River Campus, Newton)
//   "where": [ {                                    // wherePlan / whereAnswer / whenText
//     "dish": "Golden BBQ Chicken Thigh", "clock": "2026-10-08T12:41:00-04:00",
//     "answer": [ {"st": "now"|"later"|"tomorrow", "meal": "lunch"|..|"all"|"grab", "day": 0|1,
//                  "open": "11:00 AM", "close": "4:30 PM", "halls": ["W", "c8", ...]} ],   // halls: place keys, halls first
//     "text": ["Lunch now, until 4:30 PM"],          // one line per answer, as the sheet prints it
//     "newton": true } ],                             // only on a case computed with the Charles River toggle on; off,
//                                                     // Charles River servings are left out of every answer
//   "plate": [ {                                    // addDish / stepItem / plateLabel / totals, from an empty state
//     "name": "benchmark",
//     "ops": [ ["add", meal, dish, [place keys]]     // refs: that dish's serving today at each place
//            | ["step", plate index, dish, +1|-1]    // +1: 1 -> 2, 1/2 -> 1; -1: 2 -> 1 -> 1/2 -> removed (an empty plate goes)
//            | ["custom", meal, name, {cal,p,c,f}]
//            | ["bowl", meal, place key, base dish | null, station, [[part dish, qty]…]] ],
//              // round 10: a bowl is one plate item, base + parts summed. A null base is a synthetic one ("Your salad from the
//              // Salad Bar") that carries no nutrition of its own; station names its bar. Another bowl of the same base and
//              // parts adds to that item's qty; the plain base dish (an "add") is always a separate item.
//     "plates": [ {"meal", "halls": [place keys] | null, "label", "items": [[dish, qty]], "totals": {"cal","p","c","f"}} ],
//     "front": index } ],
//   "scores": [ {"dish", "health": 0..7 | null, "carbon": "A".."E" | null, "rawHealthfulness": number | null} ],
//              // every distinct (dish, scores, raw) in the 15 days. health is the H0..H7 code; a raw number without
//              // one is unscored (null) and draws nothing. carbon is the CR letter; none draws nothing.
//   "price": [ {"dish", "place", "feedPrice", "shown"} ]   // the sheet shows a price only for a café serving
// }
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core');
const fs = require('fs');
const CLOCK = '2026-10-08T12:41:00-04:00';
const at = m => `2026-10-08T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00-04:00`;
const WHERE = [
  // halls: served now, now + later elsewhere, later only, tomorrow only, late night, Grab 'N Go, gone
  'Golden BBQ Chicken Thigh', 'Beef Brisket Noodle Bowl', 'Green Chile Posole', 'Black Bean Burger', 'Korean BBQ Chicken',
  'Chinese Twist Cruller', 'Chewy M&M Bar', 'Halal Burger Patty', 'Hand Cut Sweet Potato Fries', 'Roasted Zucchini',
  'Chocolate Chunk Cookie', 'Cumin Basmati Rice', 'Kachumbari Salad', 'Scrambled Eggs', 'Hard Boiled Egg', 'Tofu Scramble',
  // served at halls and cafés alike
  'French Fries', 'Cheese Pizza',
  // café only
  'Caesar Salad w/Chicken', 'Classic Chicken Sandwich', 'Chicken Tenders', '12 oz Minestrone Soup', 'Bacon, Egg & Cheese on English Muffin',
  // round 9b: Terrace (on campus), and a Charles River dish, computed with You's Charles River toggle on ("newton": true)
  'Harissa Chicken', { dish: 'Chorizo Jalapeno Quesadilla', newton: true },
];
const CLOCKS = [12 * 60 + 41, 16 * 60 + 31, 21 * 60 + 30];   // 12:41 PM, 4:31 PM (a minute after lunch ends), 9:30 PM
const PLATES = [
  { name: 'benchmark', ops: [['add', 'lunch', 'Beef Brisket Noodle Bowl', ['W', 'B']], ['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']]] },
  { name: 'narrowing', ops: [['add', 'lunch', 'Beef Brisket Noodle Bowl', ['W', 'B']], ['add', 'lunch', 'Green Chile Posole', ['W', 'F', 'H', 'B']]] },
  { name: 'conflicting hall: a second plate', ops: [['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'lunch', 'Black Bean Burger', ['F']]] },
  { name: 'half, then removed', ops: [['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['step', 0, 'Golden BBQ Chicken Thigh', -1], ['step', 0, 'Golden BBQ Chicken Thigh', 1], ['step', 0, 'Golden BBQ Chicken Thigh', -1], ['step', 0, 'Golden BBQ Chicken Thigh', -1]] },
  { name: 'emptied plate, front in range', ops: [['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'lunch', 'Black Bean Burger', ['F']], ['step', 1, 'Black Bean Burger', -1], ['step', 1, 'Black Bean Burger', -1]] },
  { name: 'custom item', ops: [['add', 'lunch', 'Beef Brisket Noodle Bowl', ['W', 'B']], ['custom', 'lunch', 'Chobani', { cal: 140, p: 12, c: 15, f: 0 }]] },
  { name: 'café plate next to a hall plate', ops: [['add', 'lunch', 'Beef Brisket Noodle Bowl', ['W', 'B']], ['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'lunch', 'Caesar Salad w/Chicken', ['Green Fields']]] },
  { name: 'same name at a hall and a café: two plates', ops: [['add', 'lunch', 'French Fries', ['hall']], ['add', 'lunch', 'French Fries', ['café']]] },
  { name: 'all-day café menu on the lunch plate', ops: [['add', 'lunch', 'Bacon, Egg & Cheese on English Muffin', ['Worcester Café']], ['add', 'lunch', 'Bacon, Egg & Cheese on English Muffin', ['Worcester Café']]] },
  { name: 'bowl: Noodle Bowl (a natural base) next to the plain dish', ops: [['bowl', 'lunch', 'W', 'Beef Brisket Noodle Bowl', 'Noodle Bowl', [['Hard Boiled Egg', 1], ['Steamed Bok Choy', 1]]], ['add', 'lunch', 'Beef Brisket Noodle Bowl', ['W']], ['bowl', 'lunch', 'W', 'Beef Brisket Noodle Bowl', 'Noodle Bowl', [['Hard Boiled Egg', 1], ['Steamed Bok Choy', 1]]]] },
  { name: 'bowl: a café dish with its Add-ons (prices sum)', ops: [['bowl', 'lunch', 'Green Fields', 'Create Your Own Salad', 'Add-ons', [['Add Fresh Avocado', 1], ['Grilled Diced Chicken', 2]]]] },
  { name: 'bowl: the Salad Bar (a synthetic base: only its parts)', ops: [['bowl', 'dinner', 'B', null, 'Salad Bar', [['Chickpeas', 1], ['Cucumbers', 1], ['Cheese Feta', .5]]]] },
  { name: 'lunch and dinner are different plates', ops: [['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'dinner', 'Korean BBQ Chicken', ['B']]] },
];
const PRICE = [['Harissa Chicken', 'Terrace'], ['Caesar Salad w/Chicken', 'Green Fields'], ['Bacon, Egg & Cheese on English Muffin', 'Worcester Café'], ['California Roll', 'Wasabi'], ['Baby Spinach', 'Roots Café'],
  ['Golden BBQ Chicken Thigh', 'W'], ["Plant Based Chic'n Broccoli Supreme w/Pasta", 'F']];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome' });
  const ctx0 = await b.newContext(); await ctx0.addInitScript(() => { try { localStorage.setItem('udine-m2-first', 'done'); } catch (e) {} }); const p = await ctx0.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + __dirname + '/index.html'); await p.evaluate(() => localStorage.removeItem('udine-m2')); await p.reload(); await p.waitForTimeout(400);
  const out = { clock: CLOCK };
  out.places = await p.evaluate(() => Object.fromEntries([...HALLS, ...[...DISHMENU].filter(isCafe).sort((a, b) => PORD(a) - PORD(b))].map(k => [k, PN(k)])));
  // ---- where
  out.where = [];
  for (const w of WHERE) for (const t of CLOCKS) {
    const n = w.dish || w, newton = !!w.newton;
    const v = await p.evaluate(([n, t, newton]) => { S.newton = newton; const k = norm(n); if (!SERV[k]) return null;
      const f = m => `${(Math.floor(m / 60) + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 || m >= 1440 ? 'AM' : 'PM'}`;
      const A = whereAnswer(k, t); S.newton = false; return { answer: A.map(g => ({ st: g.st, meal: g.meal, day: g.day, open: f(g.w[0]), close: f(g.w[1]), halls: g.hs })), text: A.map((g, i) => whenText(g, A[i - 1])) }; }, [n, t, newton]);
    if (!v) throw new Error('not served today or tomorrow: ' + n);
    out.where.push({ dish: n, clock: at(t), ...(newton ? { newton: true } : {}), ...v });
  }
  // ---- plates
  out.plate = [];
  for (const seq of PLATES) {
    const r = await p.evaluate(ops => {
      S.plates = []; S.front = 0; barMode = 'plate';
      const keyOf = s => s === 'hall' || s === 'café' ? s : HALLS.includes(s) ? s : 'c' + P.places.findIndex(x => x[0] === s);
      // a dish's serving today at a place, for that plate meal (a café's all-day menu counts for the meal the clock is in)
      const serving = (h, meal, k) => Object.values(DISH).find(d => !d.day && d.h === h && d.k === k && plateMeal(d) === meal);
      const resolved = [];
      for (const op of ops) {
        if (op[0] === 'add') { const [, meal, n, pl] = op, k = norm(n);
          let hs = pl.map(keyOf);
          if (hs[0] === 'hall') hs = HALLS.filter(h => serving(h, meal, k)); if (hs[0] === 'café') hs = [Object.values(DISH).find(d => !d.day && isCafe(d.h) && d.k === k && plateMeal(d) === meal).h];
          const refs = Object.fromEntries(hs.map(h => [h, serving(h, meal, k)])); if (Object.values(refs).some(x => !x)) throw new Error('no serving: ' + n + ' at ' + hs);
          addDish(meal, k, refs, n); resolved.push(['add', meal, n, hs]); continue; }
        else if (op[0] === 'step') { const pl = S.plates[op[1]], it = pl.items.find(i => i.n === op[2]); stepItem(pl, it, op[3]); }
        else if (op[0] === 'custom') addDish(op[1], 'custom:' + norm(op[2]), {}, op[2], op[3]);
        else if (op[0] === 'bowl') { const [, meal, pl, base, st, parts] = op, h = keyOf(pl), at = d => d.h === h && !d.day && (d.meal === meal || plateMeal(d) === meal);
          const part = n => Object.values(DISH).find(d => at(d) && d.n === n && stName(MD[0][h][d.meal][d.si][0]) === st) || (() => { throw new Error('no part ' + n + ' at ' + st); })();
          let bd;
          if (base) { const b = Object.values(DISH).find(d => at(d) && d.n === base); if (!b || !buildOf(b)) throw new Error('not a build base: ' + base); bd = bowlDish(b, parts.map(([n, q]) => [part(n), q]), null, h); }
          else { const p0 = part(parts[0][0]), y = synOf(0, h, p0.meal, p0.si); if (!y) throw new Error('not a synthetic bar: ' + st); bd = bowlDish(null, parts.map(([n, q]) => [part(n), q]), y, h); }
          addDish(meal, bd.k, { [h]: bd }, bd.n); resolved.push(['bowl', meal, h, base, st, parts]); continue; }
        resolved.push(op);
      }
      const r1 = x => Math.round(x * 10) / 10;
      return { ops: resolved, plates: S.plates.map(pl => { const t = totals(pl); return { meal: pl.meal, halls: plateHalls(pl), label: plateLabel(pl), items: pl.items.map(i => { const m = macroOf(i); return m.parts ? [i.n, i.qty, { parts: m.parts.map(([x, q]) => [x.n, q]), cal: m.cal, price: m.price }] : [i.n, i.qty]; }), totals: { cal: r1(t.cal), p: r1(t.p), c: r1(t.c), f: r1(t.f) } }; }), front: S.front };
    }, seq.ops);
    // the ops as written to the file carry place keys only (names and 'hall' / 'café' are resolved above)
    if (r.ops.some(o => (o[0] === 'add' && o[3].some(h => !(h in out.places))) || (o[0] === 'bowl' && !(o[2] in out.places)))) throw new Error('unresolved place in ' + seq.name);
    out.plate.push({ name: seq.name, ...r });
  }
  const bench = out.plate[0].plates[0];
  if (bench.label !== 'Worcester lunch' || bench.totals.cal !== 404 || bench.totals.p !== 38.9) throw new Error('benchmark plate: ' + JSON.stringify(bench));
  // ---- scores: every distinct (dish, health, carbon, raw) in the feed's 15 days
  out.scores = await p.evaluate(() => { const seen = new Map(); for (const r of DISHES) { const key = [r[0], r[10], r[11], r[13]].join('|'); if (!seen.has(key)) seen.set(key, { dish: r[0], health: r[10], carbon: r[11], rawHealthfulness: r[13] }); }
    return [...seen.values()].sort((a, b) => a.dish.localeCompare(b.dish) || String(a.health).localeCompare(String(b.health))); });
  const unscored = out.scores.filter(s => s.rawHealthfulness != null && s.health == null);
  if (unscored.length < 16) throw new Error('expected every "number but no H code" dish; got ' + unscored.length);
  // ---- price: what the dish sheet shows
  out.price = [];
  for (const [n, place] of PRICE) out.price.push(await p.evaluate(([n, place]) => {
    const h = HALLS.includes(place) ? place : 'c' + P.places.findIndex(x => x[0] === place), D = Object.values(DISH).filter(d => d.h === h && d.n === n), d = D.find(d => d.price) || D[0];   // its priced serving if it has one
    if (!d) throw new Error('no ' + n + ' at ' + place); DS = { d, refs: { [h]: d } }; renderDish();
    return { dish: n, place: PN(h), feedPrice: d.price, shown: document.querySelector('#isbody .pr')?.textContent || null }; }, [n, place]));
  if (out.price.some(x => !!x.shown !== (x.place !== 'Worcester' && x.place !== 'Franklin' && !!x.feedPrice))) throw new Error('price rule: ' + JSON.stringify(out.price));
  if (errs.length) throw new Error(errs.join('\n'));
  fs.writeFileSync(__dirname + '/vectors.json', JSON.stringify(out, null, 1) + '\n');
  console.log(`vectors.json: ${out.where.length} where (${WHERE.length} dishes x ${CLOCKS.length} clocks), ${out.plate.length} plate sequences, ${out.scores.length} scores (${unscored.length} unscored with a number), ${out.price.length} prices`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
