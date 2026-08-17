import type { Handle } from "@sveltejs/kit";
import { createServerSupabaseClient } from "$lib/supabase/server";

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerSupabaseClient(event.cookies);

	event.locals.safeGetSession = async () => {
		const {
			data: { session },
		} = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };

		const {
			data: { user },
			error,
		} = await event.locals.supabase.auth.getUser();
		if (error) return { session: null, user: null };

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders: (name) => name === "content-range" || name === "x-supabase-api-version",
	});
};
