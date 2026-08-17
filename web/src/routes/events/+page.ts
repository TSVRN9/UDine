import type { DiningEvent } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/events");
	if (!res.ok) throw error(res.status, "failed to load events");
	return { events: (await res.json()) as DiningEvent[] };
};
