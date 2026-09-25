/**
 * Token-AND dish-name matcher shared by every local search source (catalog, log history, custom
 * foods, cached-menu) so "White Pizza" finds "White Cheese Pizza" everywhere at once, not just
 * wherever someone remembered to special-case it. Both `name` and `query` are lowercased and every
 * run of non-alphanumeric characters (punctuation, multiple spaces) collapses to a single space
 * before comparing, so "pizza, white" and "white  pizza" (double space) normalize the same as
 * "white pizza". Every query TOKEN (word order doesn't matter, and words can be inserted between
 * them in `name`) must appear as a plain substring of the normalized name -- "white pizza" matches
 * "White Cheese Pizza" (both tokens present) but not "White Kidney Beans" (no "pizza" anywhere).
 *
 * Rejected: fuzzy/edit-distance matching -- more code, and it gives surprising hits (see
 * docs/briefs/offline-menus-and-search.md's Rationale).
 *
 * A blank/whitespace-only query normalizes to zero tokens, and `[].every(...)` is vacuously true --
 * matchesQuery(anything, "") is `true`. That's deliberate, not an oversight: it makes "no query
 * typed yet" mean "don't filter" for a caller that doesn't special-case emptiness itself (see
 * dishHistory.ts), while a caller that wants "nothing" for an empty query (dishCatalog.ts,
 * customFoodsStorage.ts) already guards for that before ever calling in.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesQuery(name: string, query: string): boolean {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const normalizedName = normalize(name);
  return tokens.every((token) => normalizedName.includes(token));
}
