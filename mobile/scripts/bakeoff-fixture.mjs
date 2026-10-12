// Bake-off fixture: node mobile/scripts/bakeoff-fixture.mjs -> mobile/src/bakeoff/fixture.json (+ logic/vectors.json copy).
// Place keys, the café list, allergen normalisation and the dish rules are ported from
// docs/design/explorations/2026-10-ui-overhaul/flows/M2/build.py; keep them in step.
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapInfoV2, parseStreetAddress, parseMapAddress } from "../../shared/src/hours.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOWS = join(HERE, "../../docs/design/explorations/2026-10-ui-overhaul/flows");
const OUT = join(HERE, "../src/bakeoff");
const J = (f) => JSON.parse(readFileSync(join(FLOWS, f), "utf8"));
const MENUS = J("menus-2026-10-08-to-22.json");

const HK = { Worcester: "W", Franklin: "F", Hampshire: "H", Berkshire: "B" };
const MK = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", "late night": "late", "daily offerings": "all", grabngo: "grab" };
const ORDER = ["breakfast", "lunch", "dinner", "late", "all", "grab"];
const ALG = ["Milk", "Eggs", "Fish", "Shellfish", "Tree Nuts", "Peanuts", "Wheat", "Soy", "Sesame", "Gluten", "Corn"];

const diet = (s, code) => {
  const parts = new Set(s.split(",").map((p) => p.replace(/\r.*/s, "").trim()));
  const codes = new Set(code.split(/\s+/).filter(Boolean));
  return (parts.has("Vegetarian") || codes.has("VGT") ? 1 : 0) | (parts.has("Plant Based") || codes.has("VGN") ? 2 : 0)
    | (parts.has("Halal") || codes.has("H") ? 4 : 0) | (parts.has("Local") || codes.has("LPR") ? 8 : 0) | (codes.has("SUS") ? 16 : 0);
};
const station = (s) => s.replace(/^Grab n'Go\s+/, "").replace(/(\s+(WOR|FRK|HMP|BRK))+$/, "").replace(/\s+/g, " ").trim();
const num = (v) => { const m = /^\s*([\d.]+)/.exec(v ?? ""); return m ? parseFloat(m[1]) : null; };
const dv = (v) => (/^\d+$/.test((v ?? "").trim()) ? parseInt(v.trim(), 10) : null);
const r = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
const allergens = (v) => {
  const parts = (v ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  for (const p of parts) if (!ALG.includes(p)) throw new Error("allergen " + p);
  return parts;
};
const norm = (s) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const dish = (x) => {
  const g = (k) => x[k] ?? "";
  // scored = H0..H7 in recipe-webcode; data-healthfulness alone is not trusted (H0 is a real 0). Carbon: the letter A-E.
  const hc = g("recipe-webcode").split(/\s+/).filter((c) => /^H[0-7]$/.test(c)).map((c) => +c[1]);
  const cr = g("carbon-list");
  const price = (x.price ?? "").replace(/[^\d.]/g, "");
  return {
    key: norm(g("dish-name")), name: g("dish-name").trim(), station: "",
    cal: Math.round(num(g("calories")) ?? 0), p: r(num(g("protein")) ?? 0, 1), c: r(num(g("total-carb")) ?? 0, 1), f: r(num(g("total-fat")) ?? 0, 1),
    diet: diet(g("clean-diet-str"), g("recipe-webcode")), serving: g("serving-size").trim().toLowerCase(),
    nutrition: {
      fatCal: num(g("calories-from-fat")), fat: num(g("total-fat")), fatDv: dv(g("total-fat-dv")), sat: num(g("sat-fat")), satDv: dv(g("sat-fat-dv")),
      trans: num(g("trans-fat")), chol: num(g("cholesterol")), sod: num(g("sodium")), sodDv: dv(g("sodium-dv")), carb: num(g("total-carb")),
      carbDv: dv(g("total-carb-dv")), fiber: num(g("dietary-fiber")), fiberDv: dv(g("dietary-fiber-dv")), sugar: num(g("sugars")),
      protein: num(g("protein")), proteinDv: dv(g("protein-dv")),
    },
    ingredients: g("ingredient-list").replace(/\s+/g, " ").trim(), allergens: allergens(g("allergens")),
    health: hc.length ? hc[0] : null, carbon: ["A", "B", "C", "D", "E"].includes(cr) ? cr : null, price: price ? parseFloat(price) : null,
  };
};

// ---- places
const locs = Object.fromEntries(J("locations-2026-10-08.json").map((x) => [x.location_title, x]));
const AREAS = ["Campus Center", "North, by Worcester", "Library and academic core", "Southwest, by Hampshire and Berkshire", "Charles River Campus, Newton"];
const CAFES = [
  ["Paciugo", 0, "Campus Center"], ["Tavola", 0, "Campus Center"], ["Yum! Bakery", 0, "Blue Wall, Campus Center"],
  ["Green Fields", 0, "Blue Wall, Campus Center"], ["Tamales", 0, "Blue Wall, Campus Center"], ["Wasabi", 0, "Blue Wall, Campus Center"],
  ["Deli Delish", 0, "Blue Wall, Campus Center"], ["Star Ginger", 0, "Blue Wall, Campus Center"], ["The Grill", 0, "Blue Wall, Campus Center"],
  ["People's Organic Coffee", 0, "Campus Center concourse"], ["Harvest Market", 0, "Campus Center concourse"], ["UMass Store", 0, "Campus Center, 2nd floor"],
  ["Worcester Café", 1, "Worcester Commons"], ["ISB Café", 1, "Integrated Science Building"], ["Morrill Café", 1, "Morrill 2"],
  ["Snack Overflow", 1, "Manning CICS"], ["The Hub", 1, "Furcolo Hall"], ["Newman Café", 1, "Newman Center"], ["Peet’s Coffee & Tea", 1, "Integrated Learning Center"],
  ["Procrastination Station", 2, "Du Bois Library"], ["Whitmore Café", 2, "Whitmore Building"], ["Carney Café", 2, "Isenberg"],
  ["Post & Bean Café", 2, "Olver Design Building"],
  ["Hampshire Café", 3, "Hampshire Dining Commons"], ["Argo Tea", 3, "Hampden"], ["Roots Café", 3, "Honors College"], ["Courtside Café", 3, "Recreation Center"],
  ["Terrace", 3, "Fieldstone Apartments"], ["Charles River Campus of UMass Amherst", 4, "Newton"],
];
const SHORT = { "Charles River Campus of UMass Amherst": "Charles River Campus" };
const rk = (n) => n.replace(/[’‘]/g, "'").toLowerCase();
const HALLLOC = { W: "Worcester Commons", F: "Franklin Dining Commons", H: "Hampshire Dining Commons", B: "Berkshire Dining Commons" };
const GRABLOC = { W: "Worcester", F: "Franklin", H: "Hampshire", B: "Berkshire" };

const L11 = Object.fromEntries(J("locations-2026-10-11.json").map((x) => [rk(x.location_title), x]));
// Closed on Oct 11; address and map_address are from the Oct 8 raw get_infov2 capture, as in build.py.
L11["procrastination station"] ??= { address: "<p>W.E.B. Du Bois Library<br/>154 Hicks Way<br/>Amherst, MA 01003</p>", map_address: "42.389757,-72.528169" };
const win = (o, c) => ({ openTime: o, closeTime: c });
const addr = (title) => ({ address: parseStreetAddress(L11[rk(title)].address), mapAddress: parseMapAddress(L11[rk(title)].map_address) });

// halls: shared's mapInfoV2 over the Oct 8 snapshot (hours), Oct 11 for the address
const feed = mapInfoV2(Object.values(locs));
const TID = { W: 1, F: 2, H: 3, B: 4 };
const hours = {}, places = [];
for (const [k, title] of Object.entries(HALLLOC)) {
  const h = feed.halls.find((x) => x.hallTid === TID[k]);
  hours[k] = { ...h, ...addr(title) };
  places.push({ key: k, name: Object.keys(HK).find((n) => HK[n] === k), area: -1, building: "", description: locs[title].short_description.trim(), payment: locs[title].accepted_payment, ...addr(title) });
}
const grab = Object.fromEntries(Object.entries(GRABLOC).map(([k, n]) => {
  const x = locs[`${n} Grab ‘N Go`];
  return [k, win(x.opening_hours, x.closing_hours)];
}));
const TITLE = {};
CAFES.forEach(([title, area, building], i) => {
  const key = "c" + i, x = locs[title], name = (SHORT[title] ?? title).replace(/’/g, "'");
  TITLE[rk(title)] = key;
  // a café has only general hours; effectiveMealWindow clamps the standard meals to them
  hours[key] = { hallTid: 0, breakfast: null, lunch: null, dinner: null, latenight: null, general: win(x.opening_hours, x.closing_hours), ...addr(title) };
  places.push({ key, name, area, building, description: x.short_description.trim(), payment: x.accepted_payment, ...addr(title) });
});

// ---- menus
const PKEY = { ...Object.fromEntries(Object.entries(HK).map(([n, h]) => [rk(n), h])), ...TITLE };
const days = Object.keys(MENUS.days).sort();
if (days[0] !== "2026-10-08" || days.at(-1) !== "2026-10-22" || days.length !== 15) throw new Error("days");
const used = new Map(), dishes = [];
const fixDays = {};
for (const iso of days) {
  const day = (fixDays[iso] = {});
  for (const [loc, meals] of Object.entries(MENUS.days[iso])) {
    const key = PKEY[rk(loc)];
    if (!key) throw new Error("place " + loc);
    day[key] = {};
    for (const mk of Object.keys(meals).sort((a, b) => ORDER.indexOf(MK[a]) - ORDER.indexOf(MK[b]))) {
      day[key][MK[mk]] = meals[mk].map(([st, ids]) => [station(st), ids.map((i) => {
        if (!used.has(i)) { used.set(i, dishes.length); dishes.push(dish(MENUS.dishes[i])); }
        return used.get(i);
      })]);
    }
  }
}
// station is per serving, not per dish: loadFixture fills Dish.station from the group it sits in.

// ---- events (build.py's merge rules)
const NOW_TS = 1791477600;
const raw = J("events-2026-10-08.json").filter((e) => e.expiration_date > NOW_TS);
const byt = Object.fromEntries(raw.map((e) => [e.title.trim(), e]));
const events = [];
for (const [t, e] of Object.entries(byt)) {
  if (t.endsWith(" Hours") && t.slice(0, -6) in byt) continue;
  const h = byt[t + " Hours"], links = [];
  if (e.pdf_link) links.push([h ? "See the menu" : "Open the flyer", e.pdf_link]);
  if (e.external_link) links.push(["Open the link", e.external_link]);
  if (h) links.push(["Holiday hours", h.external_link || h.pdf_link]);
  events.push({ title: t, expires: e.expiration_date, links, scope: t === "Indigenous Peoples Day" ? "WFHB" : "", hoursTitle: h ? h.title.trim() : null });
}
events.sort((a, b) => a.expires - b.expires);

// Busy: M2's own SIMULATED values for a Thursday lunch rush (src.html `BUSY`, `TYPICAL`; the live capture was from the
// evening, so M2 does not render it). Copied verbatim; keep in step with src.html.
const N3 = [{ in: 30, pct: null }, { in: 60, pct: null }, { in: 90, pct: null }];
const busy = {
  W: { level: 2, label: "Busy", pct: 82, usual_pct: 86, trend: "falling", vs_usual: "usual", outlook: [{ in: 30, pct: 70 }, { in: 60, pct: 55 }, { in: 90, pct: 40 }], calmer_at: "13:30", confidence: "good" },
  F: { level: 1, label: "A little busy", pct: 48, usual_pct: 55, trend: "falling", vs_usual: "usual", outlook: N3, calmer_at: null, confidence: "new" },
  H: { level: 0, label: "Not busy", pct: 27, usual_pct: 44, trend: "steady", vs_usual: "quieter", outlook: N3, calmer_at: null, confidence: "good" },
  B: { level: 2, label: "Busy", pct: 88, usual_pct: 74, trend: "steady", vs_usual: "busier", outlook: [{ in: 30, pct: 80 }, { in: 60, pct: 68 }, { in: 90, pct: null }], calmer_at: null, confidence: "new" },
};
// Typical Thursday, busy % by hour from the first hour (src.html `TYPICAL`): [first hour, values]
const typical = {
  W: [7, [15, 25, 30, 22, 30, 62, 86, 70, 40, 30, 45, 70, 82, 60, 40, 30, 22]],
  F: [7, [12, 20, 22, 18, 30, 55, 50, 30, 20, 25, 45, 55, 35, 20]],
  H: [7, [10, 18, 20, 16, 28, 44, 40, 25, 18, 22, 40, 48, 30, 18]],
  B: [11, [45, 74, 70, 45, 30, 40, 72, 84, 70, 50, 40, 45, 38]],
};
writeFileSync(join(OUT, "fixture.json"), JSON.stringify({ clock: "2026-10-08T12:41:00-04:00", areas: AREAS, places, hours, grab, busy, typical, dishes, days: fixDays, events }));
copyFileSync(join(FLOWS, "M2/vectors.json"), join(OUT, "logic/vectors.json"));
console.log(`fixture.json: ${dishes.length} dishes, ${places.length} places, ${events.length} events`);
