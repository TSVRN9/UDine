import type { PressRelease } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/press");
	if (!res.ok) throw error(res.status, "failed to load press releases");
	return { releases: (await res.json()) as PressRelease[] };
};
