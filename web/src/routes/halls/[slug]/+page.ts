import { DINING_HALLS, type MenuItem } from "@udine/shared";
import { error } from "@sveltejs/kit";
import { todayIso } from "$lib/date";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, fetch }) => {
	const hall = DINING_HALLS.find((h) => h.slug === params.slug);
	if (!hall) throw error(404, "unknown dining hall");

	const date = todayIso();
	const res = await fetch(`/api/menu?tid=${hall.tid}&date=${date}`);
	if (!res.ok) throw error(res.status, "failed to load menu");
	const items: MenuItem[] = await res.json();

	return { hall, date, items };
};
