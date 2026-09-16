import assert from "node:assert/strict";
import { test } from "node:test";
import { currentMealPeriod, effectiveMealWindow, mapInfoV2, openStatus, parseMapAddress, parseStreetAddress, type InfoV2Location } from "./hours.ts";
import type { DiningHallHours, TimeWindow } from "./types.ts";

// Real sample captured from GET https://www.umassdining.com/uapp/get_infov2, 2026-08-19 (curl -L,
// see docs/apk-reverse-engineering.md). Trimmed to the fields this module reads and to the objects
// needed to exercise the mapping: the 4 commons (3 in the "Closed" summer-schedule shape, 1 --
// Hampshire -- open with only general hours, no per-meal breakdown) plus 3 retail locations,
// including "Worcester Café" specifically -- it shares the "Worcester" prefix with "Worcester
// Commons" but isn't a commons, so it's the real-data case that makes the name-matching rule
// (startsWith + "Commons") load-bearing rather than accidentally passing on a 2-item retail sample.
// `satisfies InfoV2Location[]` (not `as`) so tsc catches this sample drifting from the real raw shape.
// Full response is 40 objects.
const REAL_INFOV2_SAMPLE = [
  {
    location_title: "Berkshire Dining Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
    // #180: real capture 2026-08-24 -- unspaced `<br/>` form (vs. Hampshire's spaced `<br />`
    // below). Malformed-map_address handling is exercised directly against parseMapAddress below
    // instead of synthesized into this fixture -- REAL_INFOV2_SAMPLE `satisfies InfoV2Location[]`
    // specifically so it stays an actual capture tsc can catch drifting, not a place for
    // hand-invented values real feeds don't publish.
    address: "<p>121 Southwest Cir<br/>Amherst, MA 01003</p>",
    map_address: "42.3828621,-72.530198",
  },
  {
    location_title: "Worcester Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
    // #180: no address/map_address keys at all -- proves the "absent field" path (distinct from
    // Berkshire's "present but malformed" case above), same optional-key trust-boundary shape
    // InfoV2Location's breakfast/lunch/dinner fields already have (issue #100 item 2).
  },
  {
    location_title: "Franklin Dining Commons",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Hampshire Dining Commons",
    opening_hours: "07:00 AM",
    closing_hours: "09:00 PM",
    breakfast_open_time: null,
    breakfast_close_time: null,
    lunch_open_time: null,
    lunch_close_time: null,
    dinner_open_time: null,
    dinner_close_time: null,
    // #180: real capture 2026-08-24 -- `<br />` (spaced) form, distinct from Berkshire's `<br/>`
    // below, so the mapping is proven against both forms actually seen live.
    address: "<p>141 Southwest Cir<br />Amherst, MA 01003</p>",
    map_address: "42.383790,-72.530519",
  },
  {
    location_title: "Roots Café",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
  {
    location_title: "Paciugo",
    opening_hours: "11:00 AM",
    closing_hours: "06:00 PM",
    breakfast_open_time: null,
    breakfast_close_time: null,
    lunch_open_time: null,
    lunch_close_time: null,
    dinner_open_time: null,
    dinner_close_time: null,
  },
  {
    location_title: "Worcester Café",
    opening_hours: "Closed",
    closing_hours: "Closed",
    breakfast_open_time: "",
    breakfast_close_time: "",
    lunch_open_time: "",
    lunch_close_time: "",
    dinner_open_time: "",
    dinner_close_time: "",
  },
] satisfies InfoV2Location[];

// --- mapping (mapInfoV2) ---

test("mapInfoV2 keys the 4 commons to DINING_HALLS tids by name", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.deepEqual(
    feed.halls.map((h) => h.hallTid).sort((a, b) => a - b),
    [1, 2, 3, 4],
  );
  // Worcester Commons -> tid 1 per DINING_HALLS -- also confirms real location_ids in the live
  // feed (Worcester=1, Franklin=2, Hampshire=3, Berkshire=4) agree with our own tid assignment.
  const worcester = feed.halls.find((h) => h.hallTid === 1);
  assert.equal(worcester?.general, null); // "Closed" (summer schedule)
});

test("mapInfoV2 does not match 'Worcester Café' as the Worcester commons, despite sharing the name prefix", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.equal(feed.halls.length, 4); // not 5 -- Worcester Café must not have matched a hall
  assert.ok(feed.retail.some((r) => r.name === "Worcester Café"));
});

test("mapInfoV2 falls back to general hours when a hall has no per-meal breakdown published", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  const hampshire = feed.halls.find((h) => h.hallTid === 3);
  assert.deepEqual(hampshire?.general, { openTime: "07:00 AM", closeTime: "09:00 PM" });
  assert.equal(hampshire?.breakfast, null);
  assert.equal(hampshire?.lunch, null);
  assert.equal(hampshire?.dinner, null);
});

test("mapInfoV2 puts non-commons locations (cafés/retail) in retail, not halls", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  assert.equal(feed.halls.length, 4);
  assert.equal(feed.retail.length, 3);
  const paciugo = feed.retail.find((r) => r.name === "Paciugo");
  assert.deepEqual(paciugo?.hours, { openTime: "11:00 AM", closeTime: "06:00 PM" });
  const roots = feed.retail.find((r) => r.name === "Roots Café");
  assert.equal(roots?.hours, null);
});

// #176: café-tap prerequisite plumbing. Real capture from GET get_infov2, 2026-08-24 -- People's
// Organic Coffee (location_id=32, matches foodpro-menu-ajax's own tid for it, see umassDining.ts's
// #175 doc comments), a populated breakfast_menu HTML price list, empty lunch/dinner_menu.
const REAL_PEOPLES_ORGANIC = {
  location_title: "People's Organic Coffee",
  opening_hours: "07:00 AM",
  closing_hours: "04:00 PM",
  breakfast_menu:
    "<p>Bacon Croissant</p><p>Veggie Croissant</p><p>Turkey &amp; Bacon</p><p>Breakfast Brioche</p><p>Quiche, Broccoli</p><p>Quiche, Ham</p><p>Antioxidant</p><p>Salad Strawberry Pecan</p>",
  lunch_menu: "",
  dinner_menu: "",
  location_id: 32,
  accepted_payment: "Cash, Credit Cards, UCard, Dining Dollars, YCMP",
  short_description_v2:
    "<p>Located on the main concourse of the Campus Center, People’s Organic offers natural, organic, and sustainable foods. Choose from a selection of salads, paninis, fresh cookies, locally baked pastries, and so much more. People’s organic serves Fair Trade coffees, features a variety of coffee beverages, and organic teas.</p>",
  address: "<p>1 Campus Center Way<br/>Amherst, MA 01003</p>",
  map_address: "42.3915402,-72.5292962",
} satisfies InfoV2Location;

test("mapInfoV2 carries locationId + raw description/address/mapAddress/acceptedPayment through onto RetailLocationHours (#176)", () => {
  const feed = mapInfoV2([REAL_PEOPLES_ORGANIC]);
  const loc = feed.retail[0];
  assert.equal(loc?.locationId, 32); // same tid foodpro-menu-ajax expects for this location
  assert.equal(loc?.description, REAL_PEOPLES_ORGANIC.short_description_v2);
  assert.equal(loc?.address, REAL_PEOPLES_ORGANIC.address);
  assert.equal(loc?.mapAddress, "42.3915402,-72.5292962");
  assert.equal(loc?.acceptedPayment, "Cash, Credit Cards, UCard, Dining Dollars, YCMP");
});

test("mapInfoV2 carries a populated *_menu field through as raw HTML, and maps an empty one to null (#176)", () => {
  const feed = mapInfoV2([REAL_PEOPLES_ORGANIC]);
  const loc = feed.retail[0];
  assert.equal(loc?.breakfastMenu, REAL_PEOPLES_ORGANIC.breakfast_menu);
  assert.equal(loc?.lunchMenu, null); // feed publishes "" -- no lunch menu at this location
  assert.equal(loc?.dinnerMenu, null);
});

// Real capture, same day -- babyBerk (a food truck, location_id=61) is the CLAUDE.md-cited
// degenerate case: map_address is the literal string "," (no real coordinates) and address is
// effectively empty HTML (`<p><br/>,  </p>`), yet both fields ARE present in the raw response, not
// omitted. breakfast_menu here is a PDF link, not an item list -- still just an HTML string,
// verifying store-RAW doesn't special-case menu content shape.
const REAL_BABYBERK = {
  location_title: "babyBerk",
  opening_hours: "07:00 PM",
  closing_hours: "01:00 PM",
  breakfast_menu: '<p><a href="https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf" target="_blank">Baby Berk Menu</a></p>',
  lunch_menu: "",
  dinner_menu: "",
  location_id: 61,
  accepted_payment: "Cash, Credit Cards, UCard, Dining Dollars, YCMP",
  short_description_v2:
    "<p>Find the babyBerk food truck around campus featuring their famous babyBerk burger, golden BBQ, and UMac and Nash: Nashville hot chicken quesadilla with Mac and cheese!</p>",
  address: "<p><br/>,  </p>",
  map_address: ",",
} satisfies InfoV2Location;

test("mapInfoV2 passes babyBerk's degenerate map_address ('no real coordinates') through untouched, not parsed or dropped (#176)", () => {
  const feed = mapInfoV2([REAL_BABYBERK]);
  const loc = feed.retail[0];
  assert.equal(loc?.locationId, 61);
  assert.equal(loc?.mapAddress, ","); // present but garbage -- stored as-is, not thrown on
  assert.equal(loc?.address, "<p><br/>,  </p>"); // present but effectively empty -- still stored raw
  assert.equal(loc?.breakfastMenu, REAL_BABYBERK.breakfast_menu); // a PDF link, still just raw HTML
});

test("mapInfoV2 degrades locationId to undefined, never throws, when location_id is absent from the raw object (#176)", () => {
  const { location_id, ...withoutLocationId } = REAL_PEOPLES_ORGANIC;
  const feed = mapInfoV2([withoutLocationId]);
  assert.equal(feed.retail[0]?.locationId, undefined);
});

// --- address/mapAddress (#180: hall-info sheet's address card + DIRECTIONS row) ---

test("mapInfoV2 populates address/mapAddress on halls from get_infov2's address/map_address fields", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  const hampshire = feed.halls.find((h) => h.hallTid === 3);
  // <br /> (spaced) form -- only the street line is kept, "Amherst, MA 01003" is dropped (the
  // sheet hardcodes a "UMass Amherst" caption there instead, see parseStreetAddress's doc).
  assert.equal(hampshire?.address, "141 Southwest Cir");
  assert.equal(hampshire?.mapAddress, "42.383790,-72.530519");
});

test("mapInfoV2 parses the unspaced <br/> address form too (Hampshire above covers the spaced <br /> form)", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  const berkshire = feed.halls.find((h) => h.hallTid === 4);
  assert.equal(berkshire?.address, "121 Southwest Cir");
  assert.equal(berkshire?.mapAddress, "42.3828621,-72.530198");
});

test("mapInfoV2 sets address/mapAddress to null when get_infov2 omits the fields entirely", () => {
  const feed = mapInfoV2(REAL_INFOV2_SAMPLE);
  const worcester = feed.halls.find((h) => h.hallTid === 1);
  assert.equal(worcester?.address, null);
  assert.equal(worcester?.mapAddress, null);
});

test("parseStreetAddress keeps only the first line and strips tags, for both <br/> and <br /> forms", () => {
  assert.equal(parseStreetAddress("<p>121 Southwest Cir<br/>Amherst, MA 01003</p>"), "121 Southwest Cir");
  assert.equal(parseStreetAddress("<p>141 Southwest Cir<br />Amherst, MA 01003</p>"), "141 Southwest Cir");
});

test("parseStreetAddress returns null for absent/empty input", () => {
  assert.equal(parseStreetAddress(null), null);
  assert.equal(parseStreetAddress(undefined), null);
  assert.equal(parseStreetAddress(""), null);
  assert.equal(parseStreetAddress("<p></p>"), null);
});

test("parseMapAddress accepts a well-formed lat,long pair and rejects anything else", () => {
  assert.equal(parseMapAddress("42.383790,-72.530519"), "42.383790,-72.530519");
  assert.equal(parseMapAddress("42,-72"), "42,-72");
  assert.equal(parseMapAddress("not-a-coordinate"), null);
  assert.equal(parseMapAddress("javascript:alert(1)"), null);
  assert.equal(parseMapAddress(""), null);
  assert.equal(parseMapAddress(null), null);
  assert.equal(parseMapAddress(undefined), null);
});

// --- time math (currentMealPeriod / openStatus) ---
// Constructed hours -- get_infov2 itself has no late-night time fields (see hours.ts's mapInfoV2
// doc), so the overnight/late-night boundary cases below exercise currentMealPeriod/openStatus
// directly rather than through the mapping.

function hallWith(windows: Partial<Omit<DiningHallHours, "hallTid">>): DiningHallHours {
  return { hallTid: 1, breakfast: null, lunch: null, dinner: null, latenight: null, general: null, ...windows };
}

const LUNCH: TimeWindow = { openTime: "11:00 AM", closeTime: "2:00 PM" };
const LATE_NIGHT_OVERNIGHT: TimeWindow = { openTime: "11:00 PM", closeTime: "1:00 AM" };

test("currentMealPeriod returns the meal whose window contains now", () => {
  const hall = hallWith({ lunch: LUNCH });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "lunch");
});

test("currentMealPeriod returns closed exactly at the close time (half-open interval)", () => {
  const hall = hallWith({ lunch: LUNCH });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 14, 0)), "closed");
  // one minute before close is still lunch
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 13, 59)), "lunch");
});

test("currentMealPeriod returns closed for a hall with no hours published at all", () => {
  const hall = hallWith({});
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "closed");
});

test("currentMealPeriod returns closed between meal windows even though the hall serves other meals", () => {
  const hall = hallWith({ lunch: LUNCH, dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 15, 0)), "closed");
});

test("currentMealPeriod resolves an overnight late-night window on the starting night", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 23, 30)), "latenight");
});

test("currentMealPeriod resolves an overnight late-night window in the next-day early-morning tail", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 0, 30)), "latenight");
});

test("currentMealPeriod returns closed exactly at the overnight window's close time", () => {
  const hall = hallWith({ latenight: LATE_NIGHT_OVERNIGHT });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 1, 0)), "closed");
});

// Late Night service actually runs past midnight (late-night-2am-day-rollover brief), so the
// standard-schedule fallback's latenight window must extend to 2 AM, not close at the stroke of
// midnight -- a hall with no real published Late Night hours (get_infov2 never sends any) still
// needs its "currently serving" check to agree with the new 2 AM day-rollover boundary. `general`
// spans 9 PM-5 AM here purely so it stays open across the whole stretch under test and isolates
// the assertion to the standard fallback's own close time, not general's.
test("currentMealPeriod's standard-schedule fallback keeps Late Night open until 2 AM, not midnight", () => {
  const hall = hallWith({ general: { openTime: "9:00 PM", closeTime: "5:00 AM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 0, 30)), "latenight");
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 20, 2, 30)), "closed");
});

// UMass's own reference app (confirmed live 2026-09-01 against the real APK's Full Menu tab, both
// on a Summer Hours day and the following semester day) labels meals using a fixed clock schedule
// whenever a hall has no real per-meal times published -- get_infov2's Summer Hours shape (a lone
// `general` window, no breakfast/lunch/dinner) being the case that motivated this.
test("currentMealPeriod falls back to the standard meal schedule when only general hours are published", () => {
  const hall = hallWith({ general: { openTime: "7:00 AM", closeTime: "9:00 PM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "lunch");
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 8, 0)), "breakfast");
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 18, 0)), "dinner");
});

test("currentMealPeriod's standard-schedule fallback never fires when general doesn't cover now (hall not actually open)", () => {
  const hall = hallWith({ general: { openTime: "7:00 AM", closeTime: "9:00 PM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 5, 0)), "closed");
});

test("currentMealPeriod's standard-schedule fallback never fires with no general window either (hall fully closed)", () => {
  const hall = hallWith({});
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 12, 0)), "closed");
});

test("currentMealPeriod prefers a real published per-meal window over the standard-schedule fallback", () => {
  // Real lunch window (11-2) disagrees with the standard schedule's lunch window (11-4:30) --
  // published data must win, e.g. this hall's real 2 PM close, not the standard fallback's 4:30 PM.
  const hall = hallWith({ lunch: LUNCH, general: { openTime: "7:00 AM", closeTime: "9:00 PM" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 15, 0)), "closed");
});

test("effectiveMealWindow clamps the synthesized window to general's own close, not the standard schedule's (review finding, 2026-09-01)", () => {
  // general closes at 1 PM, well before standard lunch's 4:30 PM boundary -- the hall is NOT
  // actually open until 4:30, so the synthesized window must report 1 PM, not 4:30 PM.
  const hall = hallWith({ general: { openTime: "7:00 AM", closeTime: "1:00 PM" } });
  const noon = new Date(2026, 7, 19, 12, 0);
  assert.equal(currentMealPeriod(hall, noon), "lunch");
  const status = openStatus(hall, noon);
  assert.equal(status.open, true);
  const window = effectiveMealWindow(hall, "lunch", noon);
  assert.deepEqual(window, { openTime: "11:00 AM", closeTime: "1:00 PM" });
});

test("effectiveMealWindow clamps the synthesized window to general's own open too", () => {
  // general opens at 12:30 PM, after standard lunch's 11 AM start -- the hall wasn't actually open
  // for the first 90 minutes of the standard lunch window.
  const hall = hallWith({ general: { openTime: "12:30 PM", closeTime: "9:00 PM" } });
  const window = effectiveMealWindow(hall, "lunch", new Date(2026, 7, 19, 13, 0));
  assert.deepEqual(window, { openTime: "12:30 PM", closeTime: "4:30 PM" });
});

test("effectiveMealWindow returns null when general is open now but doesn't overlap this particular standard meal window at all", () => {
  // general is only open 5-6 AM (e.g. an early grab-and-go window); standard breakfast starts at
  // 7 AM, so they don't overlap even though general genuinely covers `now`.
  const hall = hallWith({ general: { openTime: "5:00 AM", closeTime: "6:00 AM" } });
  const window = effectiveMealWindow(hall, "breakfast", new Date(2026, 7, 19, 5, 30));
  assert.equal(window, null);
});

test("openStatus reports open with closesAt during a window", () => {
  const hall = hallWith({ lunch: LUNCH });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 14, 0));
});

test("openStatus reports closed with opensAt for the next upcoming window today", () => {
  const hall = hallWith({ lunch: LUNCH, dinner: { openTime: "5:00 PM", closeTime: "8:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 15, 0));
  assert.equal(status.open, false);
  assert.deepEqual(!status.open ? status.opensAt : null, new Date(2026, 7, 19, 17, 0));
});

test("openStatus reports closed with opensAt null for a hall closed all day", () => {
  const hall = hallWith({});
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, false);
  assert.equal(!status.open ? status.opensAt : "unreachable", null);
});

test("openStatus reports the LATEST close among multiple windows that all cover now, not the first one checked", () => {
  // e.g. a semester feed publishing both a meal window and general hours for an overlapping span --
  // closesAt must be the actual latest closing time, not whichever window happens first in the
  // internal [breakfast, lunch, dinner, latenight, general] check order.
  const hall = hallWith({ lunch: LUNCH, general: { openTime: "07:00 AM", closeTime: "09:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 21, 0));
});

test("openStatus falls back to general hours when there's no per-meal breakdown", () => {
  const hall = hallWith({ general: { openTime: "07:00 AM", closeTime: "09:00 PM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 10, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 21, 0));
});

// --- hardening follow-ups from PR #98's review (issue #100) ---

test("openStatus chains into a contiguous adjacent window instead of reporting the first window's close (issue #100 item 1)", () => {
  // Breakfast 7-10 adjacent to lunch 10-2: at 9 AM the hall is still open straight through lunch,
  // so closesAt must be 2 PM (lunch's close), not 10 AM (breakfast's close) -- unreachable through
  // mapInfoV2 today (open locations publish a whole-day general window instead of adjacent per-meal
  // windows) but real the moment a latenight/per-meal source with back-to-back windows is injected.
  const BREAKFAST: TimeWindow = { openTime: "7:00 AM", closeTime: "10:00 AM" };
  const CONTIGUOUS_LUNCH: TimeWindow = { openTime: "10:00 AM", closeTime: "2:00 PM" };
  const hall = hallWith({ breakfast: BREAKFAST, lunch: CONTIGUOUS_LUNCH });
  const status = openStatus(hall, new Date(2026, 7, 19, 9, 0));
  assert.equal(status.open, true);
  assert.deepEqual(status.open ? status.closesAt : null, new Date(2026, 7, 19, 14, 0));
});

test("openStatus does not throw on a hand-built window using a non-standard time word like 'Midnight', and treats it as no window (issue #100 item 3)", () => {
  // Hand-built windows (tests, or a future latenight source) bypass windowOrNull's TIME_PATTERN
  // check, which is the only thing currently protecting parseTimeOfDay from throwing.
  const hall = hallWith({ latenight: { openTime: "11:00 PM", closeTime: "Midnight" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 23, 30));
  assert.equal(status.open, false);
  assert.equal(status.open ? "unreachable" : status.opensAt, null);
});

test("currentMealPeriod does not throw on a hand-built window using a non-standard time word like 'Midnight' (issue #100 item 3)", () => {
  const hall = hallWith({ latenight: { openTime: "11:00 PM", closeTime: "Midnight" } });
  assert.equal(currentMealPeriod(hall, new Date(2026, 7, 19, 23, 30)), "closed");
});

test("openStatus treats openTime === closeTime as closed, not a 24h-open window (issue #100 item 4)", () => {
  // crossesMidnight uses <=, so an equal open/close time would otherwise resolve to a full 24h
  // "open" span. That's almost certainly a data error, not a real close-at-open-time schedule --
  // pinned fallback: treat it as no window (closed) rather than open all day.
  const hall = hallWith({ general: { openTime: "09:00 AM", closeTime: "09:00 AM" } });
  const status = openStatus(hall, new Date(2026, 7, 19, 12, 0));
  assert.equal(status.open, false);
  assert.equal(status.open ? "unreachable" : status.opensAt, null);
});

// Real capture: 19 of the 40 live get_infov2 objects omit the six per-meal fields entirely rather
// than publishing them as null (issue #100 item 2) -- e.g. some retail locations. `InfoV2Location`
// currently types them as required, so this fixture fails to typecheck against it even though
// mapInfoV2/windowOrNull already handle `undefined` safely at runtime (same "falsy" branch as `""`
// and `null`).
const INFOV2_MISSING_MEAL_FIELDS = [
  {
    location_title: "Paciugo",
    opening_hours: "11:00 AM",
    closing_hours: "06:00 PM",
  },
] satisfies InfoV2Location[];

test("mapInfoV2 handles a fixture object that omits the six per-meal fields entirely, not just sets them null (issue #100 item 2)", () => {
  const feed = mapInfoV2(INFOV2_MISSING_MEAL_FIELDS);
  assert.deepEqual(feed.retail[0]?.hours, { openTime: "11:00 AM", closeTime: "06:00 PM" });
});
