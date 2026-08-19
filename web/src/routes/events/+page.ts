import { sanitizeImageUrl, type DiningEvent } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/events");
	if (!res.ok) throw error(res.status, "failed to load events");
	const events = (await res.json()) as DiningEvent[];
	// See press/+page.ts's comment -- same second-pass sanitization for the same reviewer-verified bug.
	return { events: events.map((e) => ({ ...e, featuredImage: sanitizeImageUrl(e.featuredImage) })) };
};
