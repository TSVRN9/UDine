import { isUmassDiningHost } from "@udine/shared";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// #224: the café PDF SAVE link used to point straight at the upstream umassdining.com PDF.
// `download` is only honored same-origin, so that either silently fell back to a same-tab
// navigation (unloading the whole app -- the exact "bounce to an external viewer" #177 forbids) or,
// after the #178 pr-review interim fix, opened a new tab (non-destructive, but not a real download).
// This route re-serves the PDF bytes from our own origin so `<a download>` genuinely saves with no
// navigation either way. Same host gate parseRetailMenuHtml already applies (isUmassDiningHost) --
// this only ever fetches from umassdining.com, never an arbitrary caller-supplied host.
//
// No cache here, unlike /api/hours and /api/menu's retail-tid lookup: those cache a small, fixed
// key space (one hours feed, one tid set) hit on every page load. This route's key is an arbitrary
// upstream PDF URL, fetched only when a user explicitly opens the PDF viewer for one café -- an
// unbounded cache key for an infrequent, multi-MB payload isn't worth the memory it'd hold.
export const GET: RequestHandler = async ({ url }) => {
	const pdfUrl = url.searchParams.get("url");
	if (!pdfUrl || !isUmassDiningHost(pdfUrl)) throw error(400, "invalid or missing url");

	// Filename comes from the (host-validated, but still caller-supplied) url string, not the
	// upstream response -- strip it down to safe characters only before it lands in a header value,
	// same defensive instinct as sanitizeLinkUrl/sanitizeImageUrl elsewhere in shared/src/content.ts.
	// decodeURIComponent throws on a malformed escape (e.g. a bare `%ZZ`), so this must not blow up
	// the request -- computed before the upstream fetch below, both so a bad url shape 400s (via the
	// generic catch-nothing-here fallback) before spending a network round trip, and so this is
	// deterministically testable without depending on what umassdining.com does with a garbage path.
	let rawName = "";
	try {
		rawName = decodeURIComponent(new URL(pdfUrl).pathname.split("/").pop() ?? "");
	} catch {
		rawName = "";
	}
	const filename = rawName.replace(/[^\w.-]/g, "_") || "menu.pdf";

	const upstream = await fetch(pdfUrl);
	if (!upstream.ok) throw error(502, "failed to fetch pdf");

	return new Response(await upstream.arrayBuffer(), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
};
