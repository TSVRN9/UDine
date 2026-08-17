import type { SupabaseClient } from "@supabase/supabase-js";
import { favoriteDiningHalls } from "./ranking.ts";
import type { RankedDish } from "./types.ts";

/** Pushes the on-device favoriteDiningHalls() output to Supabase — the only ranking-derived data allowed to sync, and only for a signed-in user. Delete-then-insert: cheap and correct for a handful of rows. */
export async function syncFavoriteHalls(supabase: SupabaseClient, userId: string, rankedDishes: RankedDish[]): Promise<void> {
  const favorites = favoriteDiningHalls(rankedDishes);

  await supabase.from("favorite_dining_halls").delete().eq("user_id", userId);
  if (favorites.length === 0) return;

  await supabase.from("favorite_dining_halls").insert(favorites.map((f) => ({ user_id: userId, hall_tid: f.hallTid, rank: f.rank })));
}
