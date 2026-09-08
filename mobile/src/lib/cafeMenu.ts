import { parseRetailMenuHtml, type MealPeriod, type MenuItem, type OpenStatus, type RetailLocationHours } from "@udine/shared";
import { searchCachedDishes, type CachedDishCatalog } from "./dishCatalog";
import { formatTime } from "./homeHero";

/** `Date` -> `YYYY-MM-DD`, for a synthetic standing-menu MenuItem's `.date` field. Not
 * mobile/src/lib/date.ts's `todayIso` -- that one's hardcoded to `new Date()`, this needs an
 * arbitrary café-screen `selectedDate`. */
function isoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** One row of a café's standing menu (parseRetailMenuHtml's "items" shape), after a best-effort
 * catalog match. A match gets a synthetic MenuItem carrying the catalog's real nutrition/allergens/
 * dietTags -- mealPeriod "allday" ("daily offerings", same convention deriveCafeMealTabs already
 * uses for a café with no breakfast/lunch/dinner split) and category "Menu" (standing HTML carries
 * no station breakdown to group by) -- so it renders/logs through the exact same dish-row/plate
 * pipeline as any hall or integrated-café item, no fork needed. A miss stays name/price only. */
export type StandingMenuEntry = { matched: true; item: MenuItem } | { matched: false; name: string; price: string | null };

/** Best-effort case-insensitive catalog match for one standing-menu row -- reuses
 * dishCatalog.ts's searchCachedDishes verbatim (same lookup PlateSheet's own search already uses),
 * preferring an exact (trimmed, case-insensitive) name match over its first substring hit.
 * ponytail: no fuzzier ranking (edit distance, token overlap) than that -- a genuine false-positive
 * substring match hasn't been observed against a real catalog; upgrade if one shows up in practice. */
function matchStandingMenuItem(parsed: { name: string; price: string | null }, catalog: CachedDishCatalog | null, hallTid: number, date: Date): StandingMenuEntry {
  const hits = searchCachedDishes(catalog, parsed.name);
  const hit = hits.find((h) => h.dishName.trim().toLowerCase() === parsed.name.trim().toLowerCase()) ?? hits[0];
  if (!hit) return { matched: false, name: parsed.name, price: parsed.price };
  return {
    matched: true,
    item: {
      dishName: hit.dishName,
      category: "Menu",
      mealPeriod: "allday",
      hallTid,
      date: isoDate(date),
      nutrition: hit.nutrition,
      allergens: hit.allergens,
      dietTags: hit.dietTags,
      price: parsed.price ?? undefined,
    },
  };
}

/**
 * Café-screen unification: `cafeTapTarget`'s old binary {menu}|{sheet} navigation decision is
 * retired -- the café route is now ALWAYS the same pushed screen (see halls/[slug].tsx's
 * HallMenuScreenBody, which now renders both halls and cafés), so there's nothing left to route
 * between. This is what that ONE screen uses to pick which of its three internal states to show,
 * per the waterfall investigation confirmed live against real UMass endpoints:
 *
 *   1. `ajaxItems` non-empty (the same `fetchMenu(locationId, date)` call the 4 dining halls use,
 *      just keyed by the café's own location_id) -> "integrated": full nutrition, real meal tabs,
 *      identical treatment to a dining hall.
 *   2. else, the standing-menu HTML (get_infov2's *_menu fields, already picked by
 *      pickCafeMenuHtml) parses (parseRetailMenuHtml) to an item list -> "standing": each row
 *      best-effort matched against the cached dish catalog (matchStandingMenuItem above).
 *   3. else, that HTML is a PDF link -> "info" carrying it (CafePdfViewer's existing affordance,
 *      surfaced from inside this same state); no html/items/pdf at all -> "info" with none --
 *      hours/address/directions/payment only (CafeSheet, narrowed to just that content).
 */
export type CafeMenuState =
  | { kind: "integrated"; items: MenuItem[] }
  | { kind: "standing"; entries: StandingMenuEntry[] }
  | { kind: "info"; pdf: { url: string; label: string } | null };

export function resolveCafeMenuState(ajaxItems: MenuItem[], standingHtml: string | null | undefined, catalog: CachedDishCatalog | null, hallTid: number, date: Date): CafeMenuState {
  if (ajaxItems.length > 0) return { kind: "integrated", items: ajaxItems };

  const parsed = parseRetailMenuHtml(standingHtml);
  if (parsed.kind === "items") {
    return { kind: "standing", entries: parsed.items.map((i) => matchStandingMenuItem(i, catalog, hallTid, date)) };
  }
  if (parsed.kind === "pdf") return { kind: "info", pdf: { url: parsed.url, label: parsed.label } };
  return { kind: "info", pdf: null };
}

/**
 * Meal tabs for a café's menu screen: derived from what the fetched items actually carry, in
 * first-seen order -- NOT hallMenuTabs.ts's fixed MEAL_TABS (breakfast/lunch/dinner/latenight),
 * which would silently drop a café-only period like "allday" ("daily offerings", #175) or
 * "grabngo" ever showing up as a tab, since a hall's selectedMeal can never equal either of those
 * (see types.ts's MealPeriod/HallMealPeriod split). Per the issue: "meal tabs only for periods the
 * café actually has."
 */
export function deriveCafeMealTabs(items: MenuItem[]): MealPeriod[] {
  const seen: MealPeriod[] = [];
  for (const item of items) {
    if (!seen.includes(item.mealPeriod)) seen.push(item.mealPeriod);
  }
  return seen;
}

/** Fallback-sheet status pill copy, verbatim per the styling spec ("OPEN · TIL 6 PM" / "CLOSED") --
 * distinct from Home's row chip (formatLocationChip's "OPEN · closes 6:00 PM"), which this issue
 * doesn't touch. */
export function cafeStatusPillText(status: OpenStatus): string {
  return status.open ? `OPEN · TIL ${formatTime(status.closesAt)}` : "CLOSED";
}

/**
 * Google Maps deep link from get_infov2's raw "lat,long" mapAddress -- null for anything that
 * isn't two parseable numbers, so a degenerate value (babyBerk's literal "," -- see CLAUDE.md and
 * hours.test.ts) hides the DIRECTIONS action instead of opening a bogus/blank maps query.
 */
export function directionsUrl(mapAddress: string | undefined): string | null {
  if (!mapAddress) return null;
  const parts = mapAddress.split(",");
  if (parts.length !== 2) return null;
  const lat = Number.parseFloat(parts[0]);
  const lng = Number.parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

/**
 * Which of the three *_menu fields backs the fallback sheet's standing-menu card. Real captures
 * (#176's hours.test.ts fixtures) only ever populate exactly one of the three at a time, so this
 * order (breakfast, then lunch, then dinner) is documented for the hypothetical case of more than
 * one being set, not something observed live.
 */
export function pickCafeMenuHtml(loc: Pick<RetailLocationHours, "breakfastMenu" | "lunchMenu" | "dinnerMenu">): string | null {
  return loc.breakfastMenu ?? loc.lunchMenu ?? loc.dinnerMenu ?? null;
}
