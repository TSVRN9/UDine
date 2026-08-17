import { createClient } from "$lib/supabase/client";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, depends }) => {
	depends("supabase:auth");

	const supabase = createClient();
	// Re-fetch the session from the browser client so it stays in sync with cookie-based auth state
	// changes (sign-in/out) without a full page reload — the standard @supabase/ssr SvelteKit recipe.
	const {
		data: { session },
	} = await supabase.auth.getSession();

	return { supabase, session: session ?? data.session };
};
