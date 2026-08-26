import type { createLatestWins } from "@udine/shared";

export type Profile = { user_id: string; display_name: string };

/** #192: runs one friend-search query through a latest-wins guard so a stale, slower response
 * can't clobber a newer, faster one. `queryFn` is the actual network call, injected so this is
 * testable without a real Supabase client -- friends/+page.svelte's search() is a thin caller
 * around this. Returns the results to apply, or null if this response is stale and must be
 * dropped. */
export async function runFriendSearch(guard: ReturnType<typeof createLatestWins>, queryFn: () => PromiseLike<{ data: Profile[] | null }>): Promise<Profile[] | null> {
  const token = guard.start();
  const { data } = await queryFn();
  if (!guard.isLatest(token)) return null; // a newer search already fired -- drop this stale response
  return data ?? [];
}
