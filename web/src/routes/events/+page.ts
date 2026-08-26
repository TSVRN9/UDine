import type { DiningEvent } from "@udine/shared";
import { error } from "@sveltejs/kit";
import { filterActiveEvents, sanitizeEvents } from "$lib/pressEvents";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/events");
	if (!res.ok) throw error(res.status, "failed to load events");
	const events = (await res.json()) as DiningEvent[];
	// See press/+page.ts's comment -- same second-pass sanitization (image AND link fields, #199)
	// for the same reviewer-verified bug, plus #199's expirationDate filter (never applied before).
	return { events: filterActiveEvents(sanitizeEvents(events)) };
};
