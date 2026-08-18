import type { StaffMember } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/staff");
	if (!res.ok) throw error(res.status, "failed to load staff directory");
	return { staff: (await res.json()) as StaffMember[] };
};
