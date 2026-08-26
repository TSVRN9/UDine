import { sanitizeImageUrl, sanitizeLinkUrl, type DiningEvent, type PressRelease } from "@udine/shared";

// Second-pass sanitization (see press/+page.ts's doc comment for why a second pass exists at all).
// #199: the original second pass only re-ran sanitizeImageUrl, leaving url/pdfLink/externalLink
// unsanitized if a future change to the API route ever bypassed the shared fetcher's own pass.
export function sanitizeReleases(releases: PressRelease[]): PressRelease[] {
	return releases.map((r) => ({ ...r, image: sanitizeImageUrl(r.image), url: sanitizeLinkUrl(r.url) }));
}

export function sanitizeEvents(events: DiningEvent[]): DiningEvent[] {
	return events.map((e) => ({
		...e,
		featuredImage: sanitizeImageUrl(e.featuredImage),
		pdfLink: sanitizeLinkUrl(e.pdfLink),
		externalLink: sanitizeLinkUrl(e.externalLink)
	}));
}

// #199: the events page never filtered on expirationDate -- expired events rendered forever.
export function filterActiveEvents(events: DiningEvent[], now: Date = new Date()): DiningEvent[] {
	return events.filter((e) => new Date(e.expirationDate) > now);
}
