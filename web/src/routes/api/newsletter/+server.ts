import { fetchNewsletter } from "@udine/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// Same no-CORS situation as /api/menu — see that file's comment. Public content, no storage.
export const GET: RequestHandler = async () => {
	return json(await fetchNewsletter());
};
