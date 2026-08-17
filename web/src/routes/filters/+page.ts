import { DINING_HALLS, type MenuItem } from "@udine/shared";
import { todayIso } from "$lib/date";
import type { PageLoad } from "./$types";

// Derive the available allergen/diet-tag options from what's actually on today's menus across
// all halls, rather than hardcoding a static list that could drift from the real data.
export const load: PageLoad = async ({ fetch }) => {
	const date = todayIso();
	const results = await Promise.all(
		DINING_HALLS.map(async (hall) => {
			const res = await fetch(`/api/menu?tid=${hall.tid}&date=${date}`);
			if (!res.ok) return [] as MenuItem[];
			return (await res.json()) as MenuItem[];
		})
	);
	const items = results.flat();

	const allergens = new Set<string>();
	const dietTags = new Set<string>();
	for (const item of items) {
		item.allergens.forEach((a) => allergens.add(a));
		item.dietTags.forEach((d) => dietTags.add(d));
	}

	return {
		allergenOptions: [...allergens].sort(),
		dietTagOptions: [...dietTags].sort()
	};
};
