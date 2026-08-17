import type { SupabaseClient } from "@supabase/supabase-js";
import { favoriteDiningHalls } from "./ranking.ts";
import type { Favorite, RankedDish } from "./types.ts";

/** Pushes the on-device favoriteDiningHalls() output to Supabase — the only ranking-derived data allowed to sync, and only for a signed-in user. Delete-then-insert: cheap and correct for a handful of rows. */
export async function syncFavoriteHalls(supabase: SupabaseClient, userId: string, rankedDishes: RankedDish[]): Promise<void> {
  const favorites = favoriteDiningHalls(rankedDishes);

  await supabase.from("favorite_dining_halls").delete().eq("user_id", userId);
  if (favorites.length === 0) return;

  await supabase.from("favorite_dining_halls").insert(favorites.map((f) => ({ user_id: userId, hall_tid: f.hallTid, rank: f.rank })));
}

/** Pushes dish favorites to favorited_foods for the favorited-food-elsewhere alert Edge Function — only ever called by the app when the user is signed in AND has notifications enabled (see CLAUDE.md data residency table). Delete-then-insert, same pattern as syncFavoriteHalls. */
export async function syncFavoritedFoods(supabase: SupabaseClient, userId: string, favorites: Favorite[]): Promise<void> {
  const dishNames = favorites.filter((f): f is Extract<Favorite, { type: "dish" }> => f.type === "dish").map((f) => f.dishName);

  await supabase.from("favorited_foods").delete().eq("user_id", userId);
  if (dishNames.length === 0) return;

  await supabase.from("favorited_foods").insert(dishNames.map((dishName) => ({ user_id: userId, dish_name: dishName })));
}
