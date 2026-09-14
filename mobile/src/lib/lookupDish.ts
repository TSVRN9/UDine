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

export type LookupDishResult = { status: "hit"; candidates: LookupDishCandidate[] } | { status: "miss" } | { status: "rate_limited" };

/**
 * Calls lookup-dish and normalizes its response. A transport failure (network drop, a non-2xx the
 * Edge Function itself didn't produce, an unexpected body shape) is folded into the same
 * "rate_limited" result the server's own honest budget-exhausted response uses -- from the user's
 * point of view both mean the identical "not available right now, try again later," and
 * PlateSheet only needs one plain, honest state to render for that, not a second one to
 * distinguish "the server said no" from "something broke on the way there."
 */
export async function lookupDishLive(supabase: SupabaseClient, query: string): Promise<LookupDishResult> {
  try {
    const { data, error } = await supabase.functions.invoke("lookup-dish", { body: { query } });
    if (error || !data) return { status: "rate_limited" };
    if (data.status === "hit" && Array.isArray(data.candidates)) return { status: "hit", candidates: data.candidates };
    if (data.status === "miss") return { status: "miss" };
    return { status: "rate_limited" };
  } catch {
    return { status: "rate_limited" };
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
