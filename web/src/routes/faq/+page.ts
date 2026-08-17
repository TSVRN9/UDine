import type { FaqCategory } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/faq");
	if (!res.ok) throw error(res.status, "failed to load FAQ");
	return { categories: (await res.json()) as FaqCategory[] };
};
