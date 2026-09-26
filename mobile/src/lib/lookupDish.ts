import type { SupabaseClient } from "@supabase/supabase-js";
import type { NutritionFacts } from "@udine/shared";

/**
 * Client side of the lookup-dish Edge Function (supabase/functions/lookup-dish) -- the manual,
 * explicit "Search UMass Dining directly" fallback in PlateSheet.tsx's merged search, for a dish
 * name the local device history + cached public.dishes catalog + OpenFoodFacts + USDA all came up
 * empty on. Deliberately NOT wired to fire on every keystroke (that would defeat the whole point
 * of the server's rate limit) -- only on an explicit tap, per that function's own design.
 */

export interface LookupDishCandidate {
  dishName: string;
  /** Human location name (e.g. "Worcester Dining Commons") -- "" when this came from an
   * already-cached public.dishes row, which carries no location context. */
  location: string;
  hallTid: number;
  nutrition: NutritionFacts;
  allergens: string[];
  dietTags: string[];
}

export type LookupDishResult =
  | { status: "hit"; candidates: LookupDishCandidate[] }
  | { status: "miss" }
  | { status: "rate_limited" }
  | { status: "offline" };

/**
 * Calls lookup-dish and normalizes its response. `rate_limited` is reserved for the server's own
 * HONEST budget-exhausted body (`{ status: "rate_limited" }`, HTTP 200 -- lookup-dish/index.ts's
 * `performLookup`); everything else that isn't a hit or a miss -- a transport failure, a non-2xx
 * the function itself didn't produce (400/405/502), an unexpected body shape -- folds into
 * `offline` instead. Distinguishing the two matters now that PlateSheet renders different copy for
 * each (docs/briefs/offline-menus-and-search.md): "the server said no for now" vs. "something broke
 * on the way there" are no longer the same user-facing message.
 */
export async function lookupDishLive(supabase: SupabaseClient, query: string): Promise<LookupDishResult> {
  try {
    const { data, error } = await supabase.functions.invoke("lookup-dish", { body: { query } });
    if (error || !data) return { status: "offline" };
    if (data.status === "hit" && Array.isArray(data.candidates)) return { status: "hit", candidates: data.candidates };
    if (data.status === "miss") return { status: "miss" };
    if (data.status === "rate_limited") return { status: "rate_limited" };
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
}

/**
 * Display label for one candidate: plain dish name, UNLESS another candidate in the same result
 * set shares that exact name (the same dish served at more than one FoodPro location, each its
 * own recipe/RecNum -- see lookup-dish/index.ts's own doc comment) -- then the location is
 * appended so the two rows -- and, if added to the plate, the two logged entries -- stay
 * distinguishable.
 */
export function labelLookupCandidate(candidate: LookupDishCandidate, allCandidates: LookupDishCandidate[]): string {
  const sharesName = allCandidates.filter((c) => c.dishName === candidate.dishName).length > 1;
  if (!sharesName || !candidate.location) return candidate.dishName;
  return `${candidate.dishName} (${candidate.location})`;
}
