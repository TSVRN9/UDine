// Writes shared/vectors/*.json from today's TS behaviour. Run: pnpm --filter @udine/shared vectors
// (TZ=America/New_York is set by that script and required here: the hours math reads local time).
// The files are the cross-language contract (TS here, Deno in supabase/functions, Dart in app/):
// edit a case here, regenerate, and review the JSON diff as a behaviour change.
import { readFileSync, writeFileSync } from "node:fs";
import { ADAPTERS, type Json } from "./vector-adapters.ts";

if (process.env.TZ !== "America/New_York") throw new Error("run with TZ=America/New_York");

const OUT = new URL("../vectors/", import.meta.url);
const SRC = new URL("../src/", import.meta.url);

type Case = { kind: string; name: string; input: unknown };

const FORMAT_COMMON =
  "Every case is {kind, name, input, expected}; expected is what shared/src (TypeScript) returns for input. " +
  "JSON null = a value that is present and null. An ABSENT key = undefined / not set: implementations must " +
  "treat a missing key and an unset field as the same thing, and must not emit null for it. " +
  "Regenerate with `pnpm --filter @udine/shared vectors`; never hand-edit expected.";

// --- foodpro fixtures: the captured fragments already inline in src/umassDining.test.ts ---------
const testSrc = readFileSync(new URL("umassDining.test.ts", SRC), "utf8");
function fragment(name: string): string {
  const m = testSrc.match(new RegExp(`const ${name} = \`([^\`]*)\`;`));
  if (!m) throw new Error(`fixture ${name} not found in umassDining.test.ts`);
  return m[1];
}
const HAMPSHIRE = fragment("REAL_FRAGMENT");
const NO_DV = fragment("FRAGMENT_MISSING_DV_ATTR");
const GREEN_FIELDS = fragment("REAL_GREEN_FIELDS_PRICED_FRAGMENT");
const HARVEST_PIZZA = fragment("REAL_HARVEST_MARKET_PIZZA_FRAGMENT");
const DAILY = fragment("REAL_DAILY_OFFERINGS_FRAGMENT");
const GRABNGO = fragment("REAL_GRABNGO_FRAGMENT");

const parse = (name: string, html: string, category: string, mealPeriod: string, hallTid: number, isoDate: string): Case => ({
  kind: "parse",
  name,
  input: { html, category, mealPeriod, hallTid, isoDate },
});
const menu = (name: string, hallTid: number, isoDate: string, response: unknown): Case => ({ kind: "menu", name, input: { hallTid, isoDate, response } });

const foodpro: Case[] = [
  parse("hampshire breakfast: two dishes, entities decoded, blank %DV is null", HAMPSHIRE, "Breakfast Entrees", "breakfast", 3, "2026-08-19"),
  parse("absent %DV attributes are omitted, not null; no ingredient list", NO_DV, "x", "breakfast", 3, "2026-08-19"),
  parse("no dishes", "<h2>Closed today</h2>", "x", "breakfast", 3, "2026-08-19"),
  parse("retail: meal-price span after the closing tag, legend icons between", GREEN_FIELDS, "Add-ons", "lunch", 4671, "2026-08-24"),
  parse("retail: unpriced item between two priced ones does not inherit a price", HARVEST_PIZZA, "Pizza", "lunch", 4306, "2026-08-24"),
  parse("retail: empty meal-price span is no price", `<a data-dish-name="Mystery Item" href="#inline">Mystery Item</a><span class="meal-price"></span>`, "x", "lunch", 4306, "2026-08-24"),
  parse("retail: blank-after-trim meal-price span is no price", `<a data-dish-name="Padded" href="#inline">Padded</a><span class="meal-price">   </span>`, "x", "lunch", 4306, "2026-08-24"),
  parse("retail all-day period", DAILY, "Salad Bar/Dressings", "allday", 32, "2026-08-24"),
  parse("retail grab n go period", GRABNGO, "Grab n'Go Hot ", "grabngo", 4306, "2026-08-24"),
  parse("empty data-dish-name falls back to the link text, entity-decoded", `<a data-dish-name="" href="#inline">Mac &amp; Cheese</a>`, "x", "dinner", 1, "2026-09-15"),
  parse("entity decoding is a single pass (&amp;amp; becomes &amp;)", `<a data-dish-name="Mac &amp;amp; Cheese" href="#inline">x</a>`, "x", "dinner", 1, "2026-09-15"),
  parse("all entities in a name", `<a data-dish-name="A &amp; B &lt;C&gt; &quot;D&quot; E&#039;s" href="#inline">x</a>`, "x", "dinner", 1, "2026-09-15"),
  parse("no nutrition attributes: every number is 0, serving size is empty", `<a data-dish-name="Bare" href="#inline">Bare</a>`, "x", "lunch", 2, "2026-09-15"),
  parse(
    "numbers are the first number in the text: '<1g' is 1, 'trace' is 0, negatives keep the sign",
    `<a data-calories="n/a" data-total-fat="<1g" data-sat-fat="trace" data-sodium="-3.5mg" data-protein="12.25 g" data-dish-name="Odd Numbers" href="#inline">x</a>`,
    "x",
    "lunch",
    2,
    "2026-09-15",
  ),
  parse(
    "thousands comma is not understood: '1,074mg' reads as 1",
    `<a data-sodium="1,074mg" data-calories="1,200" data-dish-name="Comma" href="#inline">x</a>`,
    "x",
    "lunch",
    2,
    "2026-09-15",
  ),
  parse(
    "allergen and diet lists: split on comma, trimmed, empties dropped",
    `<a data-allergens=" Milk ,, Eggs , " data-clean-diet-str="None" data-dish-name="Lists" href="#inline">x</a>`,
    "x",
    "lunch",
    2,
    "2026-09-15",
  ),
  parse("empty ingredient list is omitted", `<a data-ingredient-list="" data-dish-name="Plain" href="#inline">x</a>`, "x", "lunch", 2, "2026-09-15"),
  parse("%DV: zero is a number, not blank", `<a data-sodium-dv="0" data-sugars-dv="" data-dish-name="Dv" href="#inline">x</a>`, "x", "lunch", 2, "2026-09-15"),
  menu("wire keys map to periods in fixed order regardless of response key order; unknown keys ignored", 4306, "2026-08-24", {
    "daily offerings": { "Salad Bar/Dressings": DAILY },
    brunch: { Ignored: HAMPSHIRE },
    grabngo: { "Grab n'Go Hot ": GRABNGO },
    "late night": { Mediterranean: NO_DV },
    dinner: { Entrees: NO_DV },
    lunch: { Entrees: HAMPSHIRE },
    breakfast: { Entrees: HAMPSHIRE, Sides: NO_DV },
  }),
  menu("hall with only late night", 1, "2026-08-21", { "late night": { Mediterranean: NO_DV } }),
  menu("empty response", 2, "2026-09-15", {}),
  menu("a period key with no categories", 2, "2026-09-15", { lunch: {} }),
];

// --- hours ----------------------------------------------------------------------------------------
const closedMeals = { breakfast_open_time: "", breakfast_close_time: "", lunch_open_time: "", lunch_close_time: "", dinner_open_time: "", dinner_close_time: "" };
const nullMeals = { breakfast_open_time: null, breakfast_close_time: null, lunch_open_time: null, lunch_close_time: null, dinner_open_time: null, dinner_close_time: null };
const closed = { opening_hours: "Closed", closing_hours: "Closed", ...closedMeals };

const SAMPLE = [
  { location_title: "Berkshire Dining Commons", ...closed, address: "<p>121 Southwest Cir<br/>Amherst, MA 01003</p>", map_address: "42.3828621,-72.530198" },
  { location_title: "Worcester Commons", ...closed },
  { location_title: "Franklin Dining Commons", ...closed },
  { location_title: "Hampshire Dining Commons", opening_hours: "07:00 AM", closing_hours: "09:00 PM", ...nullMeals, address: "<p>141 Southwest Cir<br />Amherst, MA 01003</p>", map_address: "42.383790,-72.530519" },
  { location_title: "Roots Café", ...closed },
  { location_title: "Paciugo", opening_hours: "11:00 AM", closing_hours: "06:00 PM", ...nullMeals },
  { location_title: "Worcester Café", ...closed },
];
const PEOPLES = {
  location_title: "People's Organic Coffee",
  opening_hours: "07:00 AM",
  closing_hours: "04:00 PM",
  breakfast_menu: "<p>Bacon Croissant</p><p>Turkey &amp; Bacon</p>",
  lunch_menu: "",
  dinner_menu: "",
  location_id: 32,
  accepted_payment: "Cash, Credit Cards, UCard, Dining Dollars, YCMP",
  short_description_v2: "<p>Located on the main concourse of the Campus Center.</p>",
  address: "<p>1 Campus Center Way<br/>Amherst, MA 01003</p>",
  map_address: "42.3915402,-72.5292962",
};
const BABYBERK = {
  location_title: "babyBerk",
  opening_hours: "07:00 PM",
  closing_hours: "01:00 PM",
  breakfast_menu: '<p><a href="https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf" target="_blank">Baby Berk Menu</a></p>',
  lunch_menu: "",
  dinner_menu: "",
  location_id: 61,
  short_description_v2: "<p>Food truck.</p>",
  address: "<p><br/>,  </p>",
  map_address: ",",
};
const { location_id: _omitted, ...PEOPLES_NO_ID } = PEOPLES;
const COMMONS_FULL = {
  location_title: "Franklin Dining Commons",
  opening_hours: "7:00 AM",
  closing_hours: "9:00 PM",
  breakfast_open_time: "7:00 AM",
  breakfast_close_time: "10:30 AM",
  lunch_open_time: "10:30 AM",
  lunch_close_time: "2:00 PM",
  dinner_open_time: "5:00 pm",
  dinner_close_time: "Midnight",
};

const mapCase = (name: string, input: unknown[]): Case => ({ kind: "map_info_v2", name, input });
const addr = (kind: string, input: string | null): Case => ({ kind, name: JSON.stringify(input), input });

const NY = "America/New_York";
type Win = { openTime: string; closeTime: string } | null;
const w = (openTime: string, closeTime: string): Win => ({ openTime, closeTime });
const hall = (p: Partial<Record<"breakfast" | "lunch" | "dinner" | "latenight" | "general", Win>>) => ({
  hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: null, general: null, ...p,
});
const CONFIGS: Record<string, ReturnType<typeof hall>> = {
  "lunch only 11-2": hall({ lunch: w("11:00 AM", "2:00 PM") }),
  "contiguous breakfast/lunch plus dinner": hall({ breakfast: w("7:00 AM", "10:30 AM"), lunch: w("10:30 AM", "2:00 PM"), dinner: w("5:00 PM", "8:00 PM") }),
  "general only 7-9 (standard meal fallback)": hall({ general: w("7:00 AM", "9:00 PM") }),
  "general only 7-1 (fallback clamped to general)": hall({ general: w("7:00 AM", "1:00 PM") }),
  "general overnight 7 AM to 1 AM": hall({ general: w("7:00 AM", "1:00 AM") }),
  "dinner plus overnight late night 11 PM-1 AM": hall({ dinner: w("5:00 PM", "9:00 PM"), latenight: w("11:00 PM", "1:00 AM") }),
  "overlapping lunch 11-3 and dinner 2-8": hall({ lunch: w("11:00 AM", "3:00 PM"), dinner: w("2:00 PM", "8:00 PM") }),
  "nothing published": hall({}),
  "malformed: Midnight word and open equals close": hall({ lunch: w("11:00 AM", "Midnight"), dinner: w("5:00 PM", "5:00 PM"), general: w("8:00 AM", "10:00 AM") }),
  "leading-zero and lowercase times": hall({ breakfast: w("07:00 am", "10:00 AM"), general: w("07:00 AM", "09:00 PM") }),
};
const TIMES = ["00:30", "06:59", "07:00", "09:00", "10:30", "11:00", "12:00", "13:00", "14:00", "16:30", "17:00", "20:59", "21:00", "23:00", "23:59"];
const status: Case[] = [];
for (const [cfg, hours] of Object.entries(CONFIGS)) {
  for (const t of TIMES) status.push({ kind: "status", name: `${cfg} @ 2026-09-15 ${t} ${NY}`, input: { hours, now: `2026-09-15T${t}:00-04:00` } });
}
// DST: US clocks spring forward 2026-03-08 (02:00 EST -> 03:00 EDT) and fall back 2026-11-01 (02:00 EDT -> 01:00 EST).
const DST_NOWS = [
  "2026-03-08T00:30:00-05:00", "2026-03-08T01:30:00-05:00", "2026-03-08T03:30:00-04:00", "2026-03-08T12:00:00-04:00",
  "2026-11-01T00:30:00-04:00", "2026-11-01T01:30:00-04:00", "2026-11-01T01:30:00-05:00", "2026-11-01T03:00:00-05:00", "2026-11-01T12:00:00-05:00",
];
for (const cfg of ["general overnight 7 AM to 1 AM", "dinner plus overnight late night 11 PM-1 AM", "general only 7-9 (standard meal fallback)"]) {
  for (const now of DST_NOWS) status.push({ kind: "status", name: `${cfg} @ ${now} (DST) ${NY}`, input: { hours: CONFIGS[cfg], now } });
}

const hours: Case[] = [
  mapCase("real get_infov2 sample: 4 commons keyed by tid, Worcester Café stays retail", SAMPLE),
  mapCase("retail location: id, menus, description, address, payment carried through; empty menus are null", [PEOPLES]),
  mapCase("degenerate retail address and map_address pass through untouched", [BABYBERK]),
  mapCase("location_id absent: locationId omitted", [PEOPLES_NO_ID]),
  mapCase("location_id not a number: locationId omitted", [{ ...PEOPLES, location_id: "32" }]),
  mapCase("per-meal fields omitted entirely, not null", [{ location_title: "Paciugo", opening_hours: "11:00 AM", closing_hours: "06:00 PM" }]),
  mapCase("commons with per-meal windows; a window with an unparseable time (Midnight) is null", [COMMONS_FULL]),
  mapCase("commons match is startsWith(hall name) && includes('Commons'): a Commons-titled sub-location also becomes the hall; a leading 'The' makes it retail", [
    { location_title: "Worcester Commons Grab n Go", opening_hours: "Closed", closing_hours: "Closed" },
    { location_title: "The Berkshire Dining Commons", opening_hours: "Closed", closing_hours: "Closed" },
    { location_title: "Hampshire Café", opening_hours: "8:00 AM", closing_hours: "2:00 PM" },
  ]),
  mapCase("empty feed", []),
  addr("street_address", "<p>121 Southwest Cir<br/>Amherst, MA 01003</p>"),
  addr("street_address", "<p>141 Southwest Cir<br />Amherst, MA 01003</p>"),
  addr("street_address", "<p>1 Campus Center Way<BR>Amherst</p>"),
  addr("street_address", "<p><br/>,  </p>"),
  addr("street_address", "<p></p>"),
  addr("street_address", "plain text"),
  addr("street_address", ""),
  addr("street_address", null),
  addr("map_address", "42.383790,-72.530519"),
  addr("map_address", "  42.3,-72.5  "),
  addr("map_address", "-33,151"),
  addr("map_address", "42.38,"),
  addr("map_address", ","),
  addr("map_address", "42.38 -72.53"),
  addr("map_address", "+42.38,-72.53"),
  addr("map_address", "42.,-72.5"),
  addr("map_address", ""),
  addr("map_address", null),
  ...status,
];

// --- match-query ----------------------------------------------------------------------------------
const m = (name: string, query: string): Case => ({ kind: "match", name: `${JSON.stringify(name)} / ${JSON.stringify(query)}`, input: { name, query } });
const matchQuery: Case[] = [
  m("White Cheese Pizza", "white pizza"),
  m("White Cheese Pizza", "pizza white"),
  m("White Kidney Beans", "white pizza"),
  m("white cheese pizza", "WHITE PIZZA"),
  m("White Cheese Pizza", "pizza, white"),
  m("White Cheese Pizza", "white  pizza"),
  m("Grandma's Lasagna", "lasagna"),
  m("Grandma's Lasagna", "grandmas"),
  m("Grandma's Lasagna", "grandma s"),
  m("Grandma's Lasagna", "pizza"),
  m("Anything", ""),
  m("Anything", "   "),
  m("Anything", "!!!"),
  m("Anything", "???"),
  m("", "pizza"),
  m("", ""),
  m("Chicken Parm", "chick"),
  m("Chicken Parm", "ken par"),
  m("Chicken Parm", "chicken chicken"),
  m("Mac & Cheese", "mac cheese"),
  m("Mac & Cheese", "mac & cheese"),
  m("Mac & Cheese", "macandcheese"),
  m("Mac-n-Cheese", "mac n cheese"),
  m("Mac-n-Cheese", "macn"),
  m("Soup (Tomato)", "tomato soup"),
  m("Soup (Tomato)", "(tomato)"),
  m("Cheese Pizza", "cheesepizza"),
  m("Pizza 2 Go", "2"),
  m("Pizza 2 Go", "pizza2"),
  m("Route 66 Burger", "66"),
  m("Jalapeño Poppers", "jalapeno"),
  m("Jalapeño Poppers", "jalape"),
  m("Jalapeño Poppers", "poppers"),
  m("Crème Brûlée", "creme brulee"),
  m("Crème Brûlée", "brûlée"),
  m("Café Mocha", "cafe mocha"),
  m("Café Mocha", "mocha"),
  m("Açaí Bowl", "bowl"),
  m("日本 Ramen", "ramen"),
  m("日本 Ramen", "日本"),
  m("Dish\twith\ttabs", "with tabs"),
  m("Line\nBreak Soup", "line soup"),
  m("Dotted.Name", "dotted name"),
  m("ÀLA CARTE", "a la carte"),
  m("İstanbul Kebab", "istanbul"),
  m("Straße Fries", "strasse"),
];

// --- favorite-match -------------------------------------------------------------------------------
const NUTRITION = {
  servingSize: "1 serving", calories: 100, caloriesFromFat: 10, totalFatG: 5, satFatG: 1, transFatG: 0,
  cholesterolMg: 0, sodiumMg: 0, totalCarbG: 10, dietaryFiberG: 1, sugarsG: 1, proteinG: 20,
};
const it = (dishName: string, hallTid: number, mealPeriod: string, date = "2026-09-15"): Json => ({
  dishName, category: "Entrees", mealPeriod, hallTid, date, nutrition: NUTRITION, allergens: [], dietTags: [],
});
const dish = (dishName: string) => ({ type: "dish", dishName });
const fav = (name: string, favorites: unknown[], menuItems: Json[]): Case => ({ kind: "match", name, input: { favorites, menuItems } });
const favoriteMatch: Case[] = [
  fav("one favorite on the menu", [dish("Chicken Parm")], [it("Chicken Parm", 1, "lunch")]),
  fav("same dish at two halls: one match per hall, in menu order", [dish("Chicken Parm")], [it("Chicken Parm", 2, "lunch"), it("Chicken Parm", 1, "lunch")]),
  fav("dish under two periods at one hall keeps the first in menu order", [dish("Chicken Parm")], [it("Chicken Parm", 1, "breakfast"), it("Chicken Parm", 1, "lunch")]),
  fav("menu order, not meal-period order, decides the first period", [dish("Chicken Parm")], [it("Chicken Parm", 1, "dinner"), it("Chicken Parm", 1, "breakfast")]),
  fav("first period is kept per hall, independently", [dish("Chicken Parm")], [it("Chicken Parm", 1, "dinner"), it("Chicken Parm", 2, "lunch"), it("Chicken Parm", 1, "breakfast")]),
  fav("case-sensitive", [dish("chicken parm")], [it("Chicken Parm", 1, "lunch")]),
  fav("no substring match", [dish("Chicken")], [it("Chicken Parm", 1, "lunch")]),
  fav("favorite with trailing space does not match", [dish("Chicken Parm ")], [it("Chicken Parm", 1, "lunch")]),
  fav("menu name is compared verbatim, no normalization", [dish("Mac & Cheese")], [it("Mac &amp; Cheese", 1, "lunch")]),
  fav("location favorite is never a food match", [{ type: "location", hallTid: 1 }], [it("Chicken Parm", 1, "lunch")]),
  fav("no favorites", [], [it("Chicken Parm", 1, "lunch")]),
  fav("no menu items", [dish("Chicken Parm")], []),
  fav("only location favorites", [{ type: "location", hallTid: 2 }, { type: "location", hallTid: 3 }], [it("Chicken Parm", 2, "lunch")]),
  fav("duplicate favorites yield one match", [dish("Chicken Parm"), dish("Chicken Parm")], [it("Chicken Parm", 1, "lunch")]),
  fav("several favorites at one hall come out in favorites order", [dish("Tofu"), dish("Chicken Parm")], [it("Chicken Parm", 1, "lunch"), it("Tofu", 1, "dinner")]),
  fav("halls come out in first-seen menu order, favorites order within a hall", [dish("B"), dish("A")], [it("A", 3, "lunch"), it("B", 3, "lunch"), it("A", 1, "dinner")]),
  fav("date and period come from the matched item", [dish("Chicken Parm")], [it("Chicken Parm", 4, "latenight", "2026-09-16")]),
  fav("mixed favorites: only the dish ones match", [{ type: "location", hallTid: 1 }, dish("Chicken Parm")], [it("Chicken Parm", 1, "lunch")]),
];

// --- export ---------------------------------------------------------------------------------------
const nut = (o: Json = {}): Json => ({
  servingSize: "1 slice",
  calories: 250,
  caloriesFromFat: 90,
  totalFatG: 10,
  satFatG: 4.5,
  transFatG: 0,
  cholesterolMg: 20,
  sodiumMg: 480,
  totalCarbG: 30,
  dietaryFiberG: 2,
  sugarsG: 3.5,
  proteinG: 12,
  ...o,
});
const entry = (id: string, loggedAt: string, source: Json, servings: number, nutrition: Json): Json => ({ id, loggedAt, source, servings, nutrition });
const ENTRIES: Json[] = [
  entry("e1", "2026-09-15T12:30:00.000Z", { type: "umass-menu", dishName: "Mac & Cheese", hallTid: 1 }, 1, nut()),
  entry("e2", "2026-09-15T18:05:10.000Z", { type: "off", barcode: "0123456789012", productName: 'Say "Cheese", Please' }, 0.5, nut({ calories: 99.5, proteinG: 3.25, totalFatDv: 15, satFatDv: null })),
  entry("e3", "2026-09-16T08:00:00.000Z", { type: "usda", fdcId: "171077", productName: "Line one\nline two, \"quoted\"" }, 2, nut({ calories: 0, proteinG: 0.1 })),
  entry("e4", "2026-09-16T19:45:00.000Z", { type: "custom", customFoodId: "c1", productName: "=SUM(A1)" }, 1.5, nut({ sodiumDv: 20, proteinDv: 0 })),
  entry("e5", "2026-09-17T07:15:00.000Z", { type: "umass-menu", dishName: "+Plus @home -dash", hallTid: 3 }, 3, nut()),
  entry("e6", "2026-09-17T13:00:00.000Z", { type: "umass-menu", dishName: "Crêpes à la façon, 北京烤鸭 \u{1F355}", hallTid: 4 }, 1, nut({ calories: 1234.5678 })),
  entry("e7", "2026-09-17T13:01:00.000Z", { type: "off", barcode: "1", productName: "tab\there \u0001 ctrl \\ slash \u2028" }, 1, nut()),
];
const RANKED_DISHES = [
  { dishName: "Mac & Cheese", hallTid: 1, rating: 1516, comparisonCount: 3 },
  { dishName: 'Say "Cheese", Please', hallTid: 2, rating: 1483.7234567, comparisonCount: 1 },
  { dishName: "-Dash\nNewline", hallTid: 3, rating: 1500.5, comparisonCount: 0 },
  { dishName: "Crêpes 北京", hallTid: 4, rating: 1e-7, comparisonCount: 12 },
];
const RANKED_FOODS = [
  { dishName: "Mac & Cheese", rating: 1516, comparisonCount: 3 },
  { dishName: '"Quoted", comma', rating: 1484.25, comparisonCount: 4 },
  { dishName: "@mention\n\u{1F355}", rating: 1500, comparisonCount: 0 },
];
const FAVORITES = [
  { type: "dish", dishName: "Mac & Cheese" },
  { type: "dish", dishName: '=cmd|"x", y' },
  { type: "location", hallTid: 2 },
  { type: "dish", dishName: "Crêpes\n北京" },
];
const CUSTOM_FOODS = [
  { id: "c1", name: "Mom's Chili, extra", servingSize: "1 cup (240 g)", nutrition: nut(), ingredients: 'beans, "secret" spice,\nlove' },
  { id: "c2", name: "=Bare", servingSize: "1", nutrition: nut({ calories: 12.5, proteinDv: 4 }) },
  { id: "c3", name: "北京烤鸭 \u{1F355}", servingSize: "", nutrition: nut(), ingredients: "-minus start" },
];
const exp = (kind: string, name: string, input: unknown): Case => ({ kind, name, input });
const exportCases: Case[] = [
  ...(
    [
      ["entries", ENTRIES],
      ["ranked_dishes", RANKED_DISHES],
      ["ranked_foods", RANKED_FOODS],
      ["favorites", FAVORITES],
      ["custom_foods", CUSTOM_FOODS],
    ] as [string, unknown[]][]
  ).flatMap(([base, rows]) =>
    ["json", "csv"].flatMap((fmt) => [
      exp(`${base}_${fmt}`, "representative rows with quotes, commas, newlines, unicode, formula prefixes", rows),
      exp(`${base}_${fmt}`, "no rows", []),
    ]),
  ),
  ...["json", "csv"].map((fmt) =>
    exp(`ranked_foods_${fmt}`, "number formatting: huge, tiny and fractional ratings", [
      { dishName: "a", rating: 1e20, comparisonCount: 0 },
      { dishName: "b", rating: 1e21, comparisonCount: 1 },
      { dishName: "c", rating: 123456789012345680000, comparisonCount: 2 },
      { dishName: "d", rating: -1e21, comparisonCount: 3 },
      { dishName: "e", rating: 0.00001, comparisonCount: 4 },
      { dishName: "f", rating: 1.5e-5, comparisonCount: 5 },
      { dishName: "g", rating: 0.000001, comparisonCount: 6 },
      { dishName: "h", rating: 1e-7, comparisonCount: 7 },
      { dishName: "i", rating: 0.1 + 0.2, comparisonCount: 8 },
      { dishName: "j", rating: 2 ** 53, comparisonCount: 9 },
      { dishName: "k", rating: -0, comparisonCount: 10 },
    ]),
  ),
  exp("entries_csv", "single umass-menu entry", [ENTRIES[0]]),
  exp("entries_json", "single usda entry", [ENTRIES[2]]),
];

// --- write ----------------------------------------------------------------------------------------
const FILES: Record<string, { about: string }> = {
  "export.json": {
    about:
      "Device-data exporters (storage.ts export*AsJson / export*AsCsv). kind=<rows>_<json|csv>, rows being entries (LogEntry[]), ranked_dishes, ranked_foods, favorites or custom_foods: input is the row array -> the exported string, byte for byte. " +
      "JSON is 2-space-indented JSON.stringify of the rows (integral numbers print without a decimal point). CSV is a header line then one line per row joined by LF with no trailing newline; every field is double-quoted with embedded quotes doubled, " +
      "and a field whose text starts with = + - or @ gets a tab inserted after the opening quote. Input key order is the output key order.",
  },
  "foodpro.json": {
    about:
      "foodpro-menu-ajax parsing. kind=parse: input {html, category, mealPeriod, hallTid, isoDate} -> MenuItem[] (parseCategoryItems). " +
      "kind=menu: input {hallTid, isoDate, response} where response is the feed's JSON (period wire key -> category -> html) -> the flattened MenuItem[] fetchMenu returns, in wire-key order breakfast, lunch, dinner, 'late night' (period latenight), 'daily offerings' (allday), grabngo, then categories in object order. " +
      "MenuItem optional keys price and ingredients are omitted when absent. nutrition.*Dv is a number, null (attribute present but blank) or omitted (attribute absent).",
  },
  "hours.json": {
    about:
      "get_infov2 hours. kind=map_info_v2: input is the raw array -> {halls, retail} (mapInfoV2). kind=street_address / map_address: input string or null -> string or null. " +
      "kind=status: input {hours: DiningHallHours, now} -> {mealPeriod, openStatus, effective}; now is an absolute instant (ISO 8601 with offset), and the wall clock it is read in is " +
      `${NY} (get_infov2 times are Eastern wall-clock; DST days are included). openStatus is {open:true, closesAt} or {open:false, opensAt} with opensAt null when nothing opens later today; ` +
      "closesAt/opensAt are UTC instants (ISO 8601 'Z'). effective maps each of breakfast/lunch/dinner/latenight to the window effectiveMealWindow returns, or null. " +
      "Windows are {openTime, closeTime} strings exactly as published, except effective windows synthesized from `general`, which are re-formatted as 'H:MM AM/PM'.",
  },
  "match-query.json": {
    about:
      "Token-AND dish-name search (matchesQuery). kind=match: input {name, query} -> boolean. Both strings are lowercased and every run of characters outside [a-z0-9] (including all non-ASCII letters) becomes one space; " +
      "the query splits on spaces into tokens; true iff there is at least one token and each token is a substring of the normalized name.",
  },
  "favorite-match.json": {
    about:
      "Favorited dishes on a fetched menu (matchFavoritedDishes). kind=match: input {favorites, menuItems} -> [{dishName, hallTid, mealPeriod, date}]. " +
      "Exact, case-sensitive, verbatim name match; only favorites with type 'dish' count; one result per (hall, favorited name), taking the first menu item for that name within the hall in menuItems order. " +
      "Output order: halls by first appearance in menuItems, then favorited names in first-appearance order in favorites.",
  },
};

const CASES: Record<string, Case[]> = { "foodpro.json": foodpro, "hours.json": hours, "match-query.json": matchQuery, "favorite-match.json": favoriteMatch, "export.json": exportCases };
for (const [file, { about }] of Object.entries(FILES)) {
  const cases = CASES[file];
  const adapters = ADAPTERS[file];
  const seen = new Set<string>();
  const out = [];
  for (const c of cases) {
    const adapter = adapters[c.kind];
    if (!adapter) throw new Error(`${file}: no adapter for kind ${c.kind}`);
    const key = `${c.kind}|${c.name}`;
    if (seen.has(key)) throw new Error(`${file}: duplicate case ${key}`);
    seen.add(key);
    out.push({ kind: c.kind, name: c.name, input: c.input, expected: await adapter(c.input as never) });
  }
  writeFileSync(new URL(file, OUT), JSON.stringify({ format: `${about} ${FORMAT_COMMON}`, cases: out }, null, 2) + "\n");
  const counts: Record<string, number> = {};
  for (const c of out) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  console.log(file, out.length, JSON.stringify(counts));
}
