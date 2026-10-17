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
//              // round 10: a bowl is one plate item, base + parts summed. A null base is a synthetic one (round 11: "Salad Bar", named for
//              // its station) that carries no nutrition of its own; station names its bar. Another bowl of the same base and
//              // parts adds to that item's qty; the plain base dish (an "add") is always a separate item.
//     "plates": [ {"meal", "halls": [place keys] | null, "label", "items": [[dish, qty]], "totals": {"cal","p","c","f"}} ],   // a total is null when every item's value is blank (calories round 12b; protein, carbs, fat round 12c)
//     "front": index } ],
//   "scores": [ {"dish", "health": 0..7 | null, "carbon": "A".."E" | null, "rawHealthfulness": number | null} ],
//              // every distinct (dish, scores, raw) in the 15 days. health is the H0..H7 code; a raw number without
//              // one is unscored (null) and draws nothing. carbon is the CR letter; none draws nothing.
//   "price": [ {"dish", "place", "feedPrice", "shown"} ],  // the sheet shows a price only for a café serving
//   // round 11
//   "bowlbase": [ {"day", "place", "meal", "base", "synthetic"} ],   // every hall Noodle Bowl station-day, Oct 8-22: exactly one base,
//              // its soup or dish (synthetic: a pho bar of parts, whose row is the station, "Noodle Bowl", and whose bowl takes the name of
//              // the one broth picked from "choices"; round 11b). The rule is baseOf; phoOf builds the pho.
//   "synthetic": [ {"day", "place", "meal", "station", "label"} ],  // every station-day with a synthetic base: unpriced Salad Bar
//              // and Deli Bar (never by the pound), and the halls' pho bars. A station not listed has none.
//   "alerts": [ {"favorites": [dish], "runs": [ {"clock", "posted": [[title, body]]} ]} ],   // alertRun, allowed, runs in
//              // order on Oct 8 sharing one dedup: one per dish per day, from 7 AM, not once its last serving today ended
//   // round 13 (owner, 2026-10-17): the server sends one visible push per dish per day at about 7 AM Eastern (the sim's window: 7:00 to 7:59), so
//   // alerts' runs after the window post nothing, and the iOS icon badge is the number of notifications delivered since the app was last opened
//   // (the length of the 7 AM run's "posted"; Android: the launcher dot while one is unread; opening the app or tapping one clears it).
//   "stars": [ {"favorites": [dish], "clock", "halls": [hall keys with a star], "meals": {hall: the meal now, else the next ahead today, else null}} ],
//              // a hall card's star: a favorite is served at that hall in that meal
//   "packaged": {"query", "yours": [name], "shown": [[name, calPer100g]]},   // the recorded OFF answer as the Packaged group
//              // shows it: a name once, no hit without calories, nothing already in Your foods, the brand leading a name
//              // that lacks it
//   "search": see the block that builds it (flutter-port-search)
//   "saved": [ {"net": "offline"|"fail", "savedCafes": [name], "place", "day", "saved"} ],  // which menus Search can read
//   // round 12: variant families (variantOf / famsAt in src.html; NOTES "Round 12")
//   "variants": {
//     "families": [ {"day", "place", "meal", "station", "name", "axis": "size"|"milk"|"base",   // base: Coconut / Yogurt (round 12b)
//                    "variants": [[token, feed dish name, cal]]} ],   // every family, each meal of each day; the first variant is the
//              // default (sizes smallest first, milks in the feed's order). The row is named "name"; a variant reads "name, token".
//     "nearMiss": [ {"place", "station", "names": [feed names], "reason", "days"} ],   // every item the rule reads a token in but
//              // leaves alone, and every set of names one word apart that isn't a family (reason says which), over Oct 8-22
//     "shown": [[feed name, how it reads on the sheet, the plate and in history]],
//     "follow": [ {"op", "stands": chip token, "counts": its qty on the plate, "plate": [[item name, qty]]} ],   // round 12b: the variant a
//              // family row stands for after each op on the plate (add / up = added last; down three times removes): Procrastination Station's Boba
//     "phos": [ {"place", "station", "days", "proteins": [[token, chip]], "broths": [[token, chip]], "grid": [[protein, broth, feed dish name, cal]]} ],
//              // round 12b: a café pho station whose dishes are a whole protein x broth grid is picked by two pickers (protein, then
//              // broth); "days" counts its station-meals. A station whose dishes aren't such a grid (Star Ginger's ramen) keeps one picker.
//     "search": [ {"query", "rows": [ {"name", "variant": token | null, "dish": the dish its + adds, "places": [place keys]} ]} ],
//              // Search's now groups (halls, then "At cafés"): a family is one row; what was typed picks its variant
//     "alerts": [ {"favorite": family key, "clock", "posted": [[title, body]]} ] }   // a starred family alerts once, by its name
//   // round 12 (owner, 2026-10-16): "fountain": {"name", "serving", "cal", "p", "c", "f", "station", "stationDays": {hall: {meal: days}}}: every dining commons has a
//   // Fountain Drink (blank nutrients) in a last "Beverages" station at every meal but Grab 'N Go, on every posted day
// }
const { chromium } = require('/home/tavern/Projects/js/UDine/node_modules/.pnpm/node_modules/playwright-core');
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
  { name: 'bowl: a pho bar (round 11b): named after the broth picked, the rest its parts', ops: [['bowl', 'lunch', 'H', null, 'Noodle Bowl', [['Green Curry Pho Broth (Anchovies)', 1], ['Pho Noodles', 1], ['Chicken for Pho', 1]]]] },
  { name: "bowl: a café's pho builder (Whitmore Café): the pho picked, with the café's add-ons", ops: [['bowl', 'lunch', 'Whitmore Café', null, 'Noodle Bowl', [['Chicken Pho w/Vegetable Broth', 1], ['Hard Boiled Eggs', 1]]]] },
  { name: 'blank calories (20 oz Chai): the plate has no calorie total', ops: [['add', 'lunch', '20 oz Chai', ['Worcester Café']]] },
  { name: 'blank calories beside a known item: the total is the known sum', ops: [['add', 'lunch', '20 oz Chai', ['Worcester Café']], ['add', 'lunch', '16 oz Chai', ['Worcester Café']]] },
  { name: 'lunch and dinner are different plates', ops: [['add', 'lunch', 'Golden BBQ Chicken Thigh', ['W']], ['add', 'dinner', 'Korean BBQ Chicken', ['B']]] },
];
// round 11: favourite alerts, each a sequence of background runs on Oct 8 (minutes after midnight)
const ALERTS = [
  [['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh'], [6 * 60 + 50, 7 * 60 + 15, 7 * 60 + 30]],   // before 7 AM; the first run; dedup
  [['Beef Brisket Noodle Bowl'], [17 * 60]],                                                              // no push at 5 PM: a dish added after 7 AM isn't alerted
  [['Green Chile Posole'], [7 * 60, 16 * 60 + 31]],                                                       // the 7 AM push posts it; nothing later
  [['Korean BBQ Chicken', 'Chewy M&M Bar'], [7 * 60 + 59, 8 * 60]],                                       // dinner today; tomorrow only; the window closes at 8
];
const STARCASES = [[['Golden BBQ Chicken Thigh'], 12 * 60 + 41], [['Scrambled Eggs'], 6 * 60], [['Korean BBQ Chicken'], 12 * 60 + 41], [['Korean BBQ Chicken'], 17 * 60], [['Korean BBQ Chicken'], 22 * 60], [['Golden BBQ Chicken Thigh', 'Korean BBQ Chicken'], 17 * 60]];
const SAVEDCASES = [['offline', [], 'W', 0], ['offline', [], 'W', 1], ['offline', [], 'W', 2], ['offline', [], 'Green Fields', 0], ['offline', ['Green Fields'], 'Green Fields', 0],
  ['offline', ['Green Fields'], 'Green Fields', 1], ['fail', [], 'W', 0]];
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
          const part = n => Object.values(DISH).find(d => at(d) && d.n === n && (stName(MD[0][h][d.meal][d.si][0]) === st || (!base && /^(Add-ons|Toppings)$/.test(MD[0][h][d.meal][d.si][0].trim())))) || (() => { throw new Error('no part ' + n + ' at ' + st); })();
          let bd;
          if (base) { const b = Object.values(DISH).find(d => at(d) && d.n === base); if (!b || !buildOf(b)) throw new Error('not a build base: ' + base); bd = bowlDish(b, parts.map(([n, q]) => [part(n), q]), null, h); }
          else { const p0 = part(parts[0][0]), y = synOf(0, h, p0.meal, p0.si); if (!y) throw new Error('not a synthetic bar: ' + st); bd = synBowl(y, parts.map(([n, q]) => [part(n), q]), h); }
          addDish(meal, bd.k, { [h]: bd }, bd.n); resolved.push(['bowl', meal, h, base, st, parts]); continue; }
        resolved.push(op);
      }
      const r1 = x => x == null ? null : Math.round(x * 10) / 10, n1 = r1;
      return { ops: resolved, plates: S.plates.map(pl => { const t = totals(pl); return { meal: pl.meal, halls: plateHalls(pl), label: plateLabel(pl), items: pl.items.map(i => { const m = macroOf(i); return m.parts ? [i.n, i.qty, { parts: m.parts.map(([x, q]) => [x.n, q]), cal: m.cal, price: m.price }] : [i.n, i.qty]; }), totals: { cal: n1(t.cal), p: n1(t.p), c: n1(t.c), f: n1(t.f) } }; }), front: S.front };
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
  // ---- round 11
  out.bowlbase = await p.evaluate(() => noodleBases().map(x => { if (x.n !== 1) throw new Error('not one base: ' + JSON.stringify(x)); const y = x.syn && synOf(DAYS.indexOf(x.day), x.h, x.meal, MD[DAYS.indexOf(x.day)][x.h][x.meal].findIndex(([st]) => stName(st) === 'Noodle Bowl'));
    return { day: x.day, place: x.h, meal: x.meal, base: x.base, synthetic: x.syn, ...(y ? { choices: y.choices.map(d => d.n) } : {}) }; }));
  out.synthetic = await p.evaluate(() => { const out = []; MD.forEach((D, day) => Object.entries(D).forEach(([k, ms]) => Object.entries(ms).forEach(([meal, ss]) => ss.forEach(([st], si) => { const y = synOf(day, k, meal, si); if (y) out.push({ day: DAYS[day], place: k, meal, station: st, label: y.label }); })))); return out; });
  out.alerts = [];
  for (const [fav, runs] of ALERTS) out.alerts.push(await p.evaluate(([fav, runs]) => { ALERTS.on = true; ALERTS.granted = true; ALERTS.seen.clear(); S.fav = new Set(fav.map(norm));
    const f = m => `${(Math.floor(m / 60) + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
    const r = { favorites: fav, runs: runs.map(m => ({ clock: f(m), posted: alertRun(m).map(n => [n.title, n.body]) })) }; S.fav = new Set(); return r; }, [fav, runs]));
  out.stars = await p.evaluate(cases => cases.map(([fav, now]) => { S.fav = new Set(fav.map(norm)); const r = { favorites: fav, clock: `${(Math.floor(now / 60) + 11) % 12 + 1}:${String(now % 60).padStart(2, '0')} ${now < 720 || now >= 1440 ? 'AM' : 'PM'}`, halls: HALLS.filter(h => hallStar(h, now)), meals: Object.fromEntries(HALLS.map(h => [h, hallMeal(h, now)])) }; S.fav = new Set(); return r; }), STARCASES);
  out.packaged = await p.evaluate(() => { S.q = 'clif'; const r = { query: S.q, yours: S.foods.map(f => f.n), shown: packHits().map(f => [f.n, f.cal]) }; S.q = ''; return r; });
  out.saved = await p.evaluate(cases => cases.map(([net, cafes, place, day]) => { const n0 = NET, s0 = new Set(SAVED); NET = net; SAVED.clear(); cafes.forEach(c => SAVED.add(c));
    const k = HALLS.includes(place) ? place : 'c' + P.places.findIndex(x => x[0] === place), v = savedMenu(k, day); NET = n0; SAVED.clear(); s0.forEach(c => SAVED.add(c));
    return { net, savedCafes: cafes, place: k, day, saved: v }; }), SAVEDCASES);
  // ---- round 12: variant families. The rule is the page's own (variantOf, famsAt); this only reports what it decides.
  out.variants = await p.evaluate(() => {
    const families = variantFamilies().sort((a, b) => a.place.localeCompare(b.place) || a.station.localeCompare(b.station) || a.name.localeCompare(b.name) || a.day.localeCompare(b.day) || a.meal.localeCompare(b.meal));
    const miss = new Map(), put = (place, station, names, reason, day) => { const k = [place, station, names.join(' ; '), reason].join('|');
      if (!miss.has(k)) miss.set(k, { place, station, names, reason, days: new Set() }); miss.get(k).days.add(day); };
    MD.forEach((D, day) => Object.entries(D).forEach(([h, ms]) => Object.entries(ms).forEach(([meal, ss]) => ss.forEach(([st, xs], si) => {
      const ds = xs.map((_, di) => DISH[did(day, h, meal, si, di)]);
      const names = [...new Set(ds.map(d => d.n))];
      for (const d of ds) { const v = variantOf(d.n); if (!v || famOf(d)) continue;
        const reason = isPartsSt(st) ? 'an Add-ons or Toppings station: a builder\'s part' : !v.name ? 'nothing left once the milk is taken out'
          : ds.filter(x => x.n === d.n).length > 1 ? 'the same name twice (the size is in the serving, not the name)' : 'the only ' + v.axis + ' of it at this station';
        put(PN(h), st, [d.n], reason, DAYS[day]); }
      // names one word apart (one word swapped, or one more word) that the rule didn't make a family
      const T = names.map(n => n.split(/\s+/));
      const sets = new Map();
      for (let a = 0; a < T.length; a++) for (let b = a + 1; b < T.length; b++) { const A = T[a], B = T[b]; let at = -1, ok = true;
        if (A.length === B.length) { for (let i = 0; i < A.length; i++) if (A[i].toLowerCase() !== B[i].toLowerCase()) { if (at >= 0) { ok = false; break; } at = i; } }
        else { const [S0, L] = A.length < B.length ? [A, B] : [B, A]; if (L.length - S0.length !== 1) ok = false; else { let i = 0; while (i < S0.length && S0[i].toLowerCase() === L[i].toLowerCase()) i++; if (S0.slice(i).join(' ').toLowerCase() !== L.slice(i + 1).join(' ').toLowerCase()) ok = false; else at = i; } }
        if (!ok || at < 0) continue;
        const da = ds.find(d => d.n === names[a]), db = ds.find(d => d.n === names[b]), fa = famOf(da), fb = famOf(db); if (fa && fa === fb) continue;
        const tpl = (A.length >= B.length ? A : B).map((w, i) => i === at ? '_' : w).join(' ');
        (sets.get(tpl) || sets.set(tpl, new Set()).get(tpl)).add(names[a]).add(names[b]); }
      for (const [tpl, ns] of sets) { const sized = [...ns].some(n => variantOf(n));
        put(PN(h), st, [...ns].sort(), isPartsSt(st) ? 'one word apart at an Add-ons or Toppings station' : sized ? 'one word apart beside the size: a different drink or dish' : 'one word apart: a different dish', DAYS[day]); }
    }))));
    const nearMiss = [...miss.values()].map(x => ({ place: x.place, station: x.station, names: x.names, reason: x.reason, days: x.days.size }))
      .sort((a, b) => a.reason.localeCompare(b.reason) || a.place.localeCompare(b.place) || a.station.localeCompare(b.station) || a.names[0].localeCompare(b.names[0]));
    const shown = ['16 oz Cappuccino', '20 oz Cappuccino', 'Boba Oat Milk', '8 oz Clam Chowder', 'Coconut Mango Acai Bowl (16oz)', 'Berry Acai Bowl (8 oz)', '24 oz Iced Coffee', '20 oz Cold Brew', '1% Milk', 'MAPLELINE Skim Milk', 'Banana Berry Yogurt Smoothie', 'Matcha Strawberry w/Coconut', 'V-9 Smoothie w/Yogurt', 'Coconut Flavored Syrup', '20 oz Chai']
      .map(n => [n, shownName(n)]);
    const search = ['boba', 'oat', 'cappuccino', '20 oz latte', 'minestrone'].map(q => { S.q = q; const r = [...results(), ...cafeResults()].map(({ g, d, vi }) => ({ name: g.n, variant: vi >= 0 ? g.vars[vi].v : null, dish: d.n, places: Object.keys((vi >= 0 ? g.vars[vi] : g).refs).sort((a, b) => PORD(a) - PORD(b)) })); S.q = ''; return { query: q, rows: r }; });
    ALERTS.on = true; ALERTS.granted = true; ALERTS.seen.clear(); S.fav = new Set(['f:boba']);
    const alerts = [7 * 60 + 15, 12 * 60 + 41].map(m => ({ favorite: 'f:boba', clock: `${(Math.floor(m / 60) + 11) % 12 + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`, posted: alertRun(m).map(n => [n.title, n.body]) }));
    S.fav = new Set();
    const phos = new Map();
    MD.forEach((D, day) => Object.entries(D).forEach(([h, ms]) => Object.entries(ms).forEach(([meal, ss]) => ss.forEach(([st], si) => { if (!isCafe(h) || stName(st) !== 'Noodle Bowl') return;
      const y = synOf(day, h, meal, si); if (!y || !y.axes) return; const k = PN(h) + '|' + y.axes.grid.size;
      if (!phos.has(k)) phos.set(k, { place: PN(h), station: stName(st), days: 0, proteins: y.axes.p, broths: y.axes.b, grid: [...y.axes.grid].map(([pb, d]) => [...pb.split('|'), d.n, d.cal]) }); phos.get(k).days++; }))));
    // the variant a family row stands for as the plate changes (round 12b): Procrastination Station's Boba at lunch
    const follow = []; { const h = 'c' + P.places.findIndex(x => x[0] === 'Procrastination Station'), D = n => Object.values(DISH).find(d => !d.day && d.h === h && d.n === n), f = famOf(D('Boba Oat Milk'));
      S.plates = []; S.front = 0; barMode = 'plate';
      const rec = op => { const x = standing(f.vars, x => findItem(plateMeal(x.d), x.d.k, h), () => true), it = findItem(plateMeal(x.d), x.d.k, h);
        follow.push({ op, stands: x.chip, counts: it ? it.it.qty : 0, plate: S.plates.flatMap(pl => pl.items.map(i => [i.n, i.qty])) }); };
      rec('empty plate');
      for (const [op, tok] of [['add', 'Oat'], ['add', 'Soy'], ['up', 'Oat'], ['down', 'Oat'], ['down', 'Oat'], ['down', 'Oat'], ['down', 'Soy'], ['down', 'Soy']]) {
        const d = f.vars.find(x => x.chip === tok).d, found = findItem(plateMeal(d), d.k, h);
        if (op === 'add') addDish(plateMeal(d), d.k, { [h]: d }, famOf(d).name + ', ' + FAM.get(d.id).x.v); else stepItem(found.pl, found.it, op === 'up' ? 1 : -1);
        rec(op + ' ' + tok); }
      S.plates = []; }
    return { families, nearMiss, shown, search, alerts, phos: [...phos.values()], follow };
  });
  { const v = out.variants, distinct = new Set(v.families.map(f => [f.place, f.station, f.name].join('|'))).size;
    if (distinct !== 59 || v.families.length !== 392) throw new Error('variant families: ' + distinct + ' / ' + v.families.length); }
  // ---- round 12: the hall Fountain Drink (a synthetic record in a last "Beverages" station at every non-Grab meal of every hall menu)
  out.fountain = await p.evaluate(() => { const o = {}; MD.forEach((D, day) => HALLS.forEach(h => Object.entries(D[h] || {}).forEach(([meal, ss]) => { const last = ss.at(-1), ok = meal !== 'grab' && last[0] === 'Beverages' && last[1].length === 1 && DISH[did(day, h, meal, ss.length - 1, 0)].n === 'Fountain Drink';
    if (ok !== (meal !== 'grab')) throw new Error('fountain: ' + day + h + meal); if (ok) (o[h] ||= {})[meal] = (o[h][meal] || 0) + 1; })));
    const d = Object.values(DISH).find(d => d.n === 'Fountain Drink' && HALLS.includes(d.h)); return { name: d.n, serving: d.srv, cal: d.cal, p: d.p, c: d.c, f: d.f, station: 'Beverages', stationDays: o }; });
  if (errs.length) throw new Error(errs.join('\n'));
const SEARCH = [
  { q: '' }, { q: 'green' }, { q: 'pancakes' }, { q: 'apple' }, { q: 'organic' }, { q: 'worcester' }, { q: 'hal' }, { q: 'brisket' }, { q: 'chicken' }, { q: 'pizza' }, { q: 'zzzq' },
  { q: '', lens: ['protein'] }, { q: '', lens: ['light'] }, { q: '', lens: ['veg'] }, { q: '', lens: ['plant'] }, { q: '', lens: ['halal'] }, { q: '', lens: ['lowc'] }, { q: '', lens: ['fav'] },
  { q: 'chicken', lens: ['protein', 'halal'] }, { q: 'charles', newton: true }, { q: 'charles' }, { q: 'Chorizo Jalapeno Quesadilla', newton: true },
];
  // flutter-port-search: Search's groups for a typed text and lenses (the Charles River toggle on a case with "newton"), read back from #sres:
  // "search": [ {"q", "lens"?, "newton"?, "groups": [ {"title": null | "Places" | "Lunch now" | "At cafés" | "Later today and tomorrow", "rows": ["hall:W", "grab:W", "cafe:c3", "dish:<key>", "cafe-dish:<key>", "later:<key>", "empty:<text>"]} ]} ]
  out.search = await p.evaluate(cases => cases.map(c => {
    const n0 = S.newton; S.newton = !!c.newton; S.lenses = new Set(c.lens || []); S.q = c.q; document.querySelector('#q').value = c.q; renderLenses(); renderSearch();
    const g = []; let cur = { title: null, rows: [] };
    for (const e of document.querySelector('#sres').children) {
      if (e.classList.contains('sgrp')) { g.push(cur); cur = { title: e.textContent, rows: [] }; }
      else if (e.classList.contains('hcards')) cur.rows.push(...[...e.querySelectorAll('.hcard')].map(x => 'hall:' + x.dataset.h));
      else if (e.classList.contains('prow2')) cur.rows.push(e.dataset.act === 'cafe' ? 'cafe:c' + e.dataset.c : 'grab:' + e.dataset.h);
      else if (e.classList.contains('row')) cur.rows.push((e.classList.contains('later') ? 'later:' : e.dataset.cg ? 'cafe-dish:' : 'dish:') + e.dataset.k);
      else if (e.classList.contains('empty')) cur.rows.push('empty:' + e.textContent);
    }
    g.push(cur); S.newton = n0; S.lenses = new Set(); S.q = ''; document.querySelector('#q').value = '';
    return { ...c, groups: g.filter(x => x.title || x.rows.length) };
  }), SEARCH);
  fs.writeFileSync(__dirname + '/vectors.json', JSON.stringify(out, null, 1) + '\n');
  console.log(`vectors.json: ${out.where.length} where (${WHERE.length} dishes x ${CLOCKS.length} clocks), ${out.plate.length} plate sequences, ${out.scores.length} scores (${unscored.length} unscored with a number), ${out.price.length} prices, ${out.bowlbase.length} Noodle Bowl bases, ${out.synthetic.length} synthetic bars, ${out.alerts.length} alert sequences, ${out.packaged.shown.length} packaged, ${out.saved.length} saved, ${new Set(out.variants.families.map(f => [f.place, f.station, f.name].join('|'))).size} variant families (${out.variants.families.length} station-meals), ${out.variants.nearMiss.length} near-misses`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
