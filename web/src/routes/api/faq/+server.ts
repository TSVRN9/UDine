import { fetchFaq } from "@udine/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
	return json(await fetchFaq());
};
