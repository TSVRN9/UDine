import { createBrowserClient } from "@supabase/ssr";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY } from "$env/static/public";

/** Browser-side Supabase client. Only used for the favorite_dining_halls sync — everything else (menus, log, ranking) stays local, see CLAUDE.md data residency table. */
export function createClient() {
	return createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
