import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Exchanges the OAuth `code` for a session and sets the auth cookies, then redirects home. */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get("code");
	if (code) {
		await supabase.auth.exchangeCodeForSession(code);
	}
	redirect(303, "/");
};
