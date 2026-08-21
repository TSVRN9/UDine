import { sanitizeImageUrl, type DiningEvent } from "@udine/shared";

export type EventTapTarget =
  | { kind: "content"; pamphletImage: string }
  | { kind: "link"; url: string }
  | { kind: "none" };

/**
 * Classifies a DiningEvent card's tap destination (#120 canvas). The real `get_beacons_events`
 * feed (see docs/apk-reverse-engineering.md) carries no separate body/description field -- its two
 * link-shaped fields ARE the content-vs-link split: `external_link` is a true off-site URL (opens
 * the in-app browser), `pdf_link` is a same-origin umassdining.com poster graphic -- effectively
 * the event's own "pamphlet" -- so it's in-feed content pushed to the in-app detail screen instead.
 * A malformed/empty payload on both fields safely no-ops: the card still renders, the tap does
 * nothing. Reuses content.ts's sanitizeImageUrl so pdf_link inherits the same "default"-host dead
 * link handling as featured_image.
 *
 * Despite the field name, live pdf_link data is almost always a poster .jpg, not an actual PDF
 * (confirmed via curl against get_beacons_events -- see docs/apk-reverse-engineering.md) -- that's
 * what makes it renderable in-app as the pamphlet screen's <Image>. An actual .pdf file would
 * render blank there with no error (<Image> can't decode one), so that case is routed to the
 * in-app browser instead, which can.
 */
export function classifyEventTap(event: Pick<DiningEvent, "externalLink" | "pdfLink">): EventTapTarget {
  const link = event.externalLink?.trim();
  if (link && /^https?:\/\//i.test(link)) return { kind: "link", url: link };

  const pdf = sanitizeImageUrl(event.pdfLink ?? "");
  if (pdf && /\.pdf($|\?)/i.test(pdf)) return { kind: "link", url: pdf };
  if (pdf) return { kind: "content", pamphletImage: pdf };

  return { kind: "none" };
}

/** "Through <Month Day>" from a DiningEvent's expirationDate, or null if absent -- shared between
 * the Social pane's event card and the in-app pamphlet detail screen so the two don't drift. */
export function eventDateLine(expirationDate: string): string | null {
  if (!expirationDate) return null;
  return `Through ${new Date(expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
