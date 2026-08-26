import type { PressRelease } from "@udine/shared";
import { error } from "@sveltejs/kit";
import { sanitizeReleases } from "$lib/pressEvents";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/api/press");
	if (!res.ok) throw error(res.status, "failed to load press releases");
	const releases = (await res.json()) as PressRelease[];
	// /api/press already sanitizes via fetchPressReleases (shared/src/content.ts) -- this is a second,
	// client-side pass (image AND link fields, #199) so a present-but-unresolvable-host image
	// (UMass Dining's own `https://default/...` bug) or an unsanitized url can never reach the
	// template below, even if a future change to the API route bypasses the shared fetcher.
	return { releases: sanitizeReleases(releases) };
};
