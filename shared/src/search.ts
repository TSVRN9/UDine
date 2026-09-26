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
 * A blank OR punctuation-only query ("", "   ", "!!!") normalizes to zero tokens, and matches
 * NOTHING -- explicitly, not `[].every(...)`'s vacuous true. A caller that wants "list everything"
 * for an empty query (dishHistory.ts, when nothing's been typed yet) makes that its own explicit
 * decision rather than inheriting it from this function (see that file's own comment); every other
 * caller here (dishCatalog.ts, customFoodsStorage.ts, PlateSheet.tsx's cached-menu source) already
 * treats a punctuation-only or blank query as "no matches", the same way lookup-dish/index.ts's
 * `selectCandidateHits` does server-side ("punctuation-only matches nothing").
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchesQuery(name: string, query: string): boolean {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  const normalizedName = normalize(name);
  return tokens.every((token) => normalizedName.includes(token));
}
