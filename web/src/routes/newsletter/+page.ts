import type { NewsletterIssue } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/newsletter");
	if (!res.ok) throw error(res.status, "failed to load newsletter");
	return { issues: (await res.json()) as NewsletterIssue[] };
};
