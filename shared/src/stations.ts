/** Collapses a raw feed station/category name into its display form: outer whitespace trimmed,
 * internal runs of whitespace collapsed to one space (the feed has both, e.g. "Grab n'Go Hot " and
 * "Latino 1  WOR"). Does not rewrite the name otherwise -- hall-code suffixes like "WOR"/"FRK HMP"
 * are UMass's own station identifiers (shared across halls in ways that don't map to "the hall
 * you're currently on"), not scrape noise, so stripping them risks producing a wrong name rather
 * than a cleaner one. */
export function normalizeStationName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Keyword buckets for station display order, food-journey-ish: hot mains/action stations first,
 * then sides, salad/soup/deli, bread, sweets, Grab 'N Go last. Matched as a case-insensitive
 * substring against the normalized name, first match wins. Grounded in a live pull of all 4 halls'
 * real station names (2026-09-11) -- not a guess at a UMass taxonomy that doesn't exist anywhere
 * in the feed itself. A name matching none of these sorts alphabetically after every matched one,
 * so a station UMass adds later degrades to alphabetical instead of landing in a wrong bucket. */
const STATION_KEYWORDS: string[] = [
  "grill",
  "display station",
  "tandoor",
  "stir fry",
  "street food",
  "noodle",
  "pasta",
  "pizza",
  "sushi",
  "latino",
  "mediterranean",
  "international",
  "vegetarian",
  "seasons",
  "express",
  "gluten free",
  "entree",
  "omelet",
  "vegetable",
  "starch",
  "topping",
  "salad",
  "soup",
  "deli",
  "bread",
  "pastr",
  "dessert",
  "grab",
];

function stationRank(normalizedName: string): number {
  const lower = normalizedName.toLowerCase();
  if (lower.startsWith("gf ")) return STATION_KEYWORDS.indexOf("gluten free");
  const index = STATION_KEYWORDS.findIndex((keyword) => lower.includes(keyword));
  return index === -1 ? STATION_KEYWORDS.length : index;
}

/** Sorts normalized station names into a consistent display order: known station kinds in a fixed
 * food-journey order (see STATION_KEYWORDS), unrecognized ones alphabetically after all of them.
 * Deterministic given the same set of names -- never the feed's own item order, which varies by
 * what UMass happened to list first that day. */
export function sortStationNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const rankDiff = stationRank(a) - stationRank(b);
    return rankDiff !== 0 ? rankDiff : a.localeCompare(b);
  });
}
