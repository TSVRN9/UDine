import { sanitizeImageUrl, sanitizeLinkUrl, type DiningEvent } from "@udine/shared";

export type EventTapTarget =
  | { kind: "content"; pamphletImage: string }
  | { kind: "link"; url: string }
  | { kind: "none" };

/**
 * Classifies a DiningEvent card's tap destination. The real `get_beacons_events` feed carries no
 * separate body/description field -- its two link-shaped fields ARE the content-vs-link split:
 * `external_link` is a true off-site URL (opens the in-app browser), `pdf_link` is a same-origin
 * umassdining.com poster graphic -- effectively the event's own "pamphlet" -- so it's in-feed
 * content pushed to the in-app detail screen instead. A malformed/empty payload on both fields
 * safely no-ops: the card still renders, the tap does nothing. Reuses content.ts's sanitizeImageUrl
 * so pdf_link inherits the same "default"-host dead link handling as featured_image.
 *
 * Despite the field name, live pdf_link data is almost always a poster .jpg, not an actual PDF --
 * that's what makes it renderable in-app as the pamphlet screen's <Image>. An actual .pdf file
 * would render blank there with no error (<Image> can't decode one), so that case is routed to the
 * in-app browser instead, which can.
 */
export function classifyEventTap(event: Pick<DiningEvent, "externalLink" | "pdfLink">): EventTapTarget {
  // Reuses content.ts's sanitizeLinkUrl, the same scheme allowlist mapEvent already applies at the
  // fetch boundary, so there's one definition of "safe link" instead of two that can drift.
  const link = sanitizeLinkUrl(event.externalLink?.trim() ?? "");
  if (link) return { kind: "link", url: link };

  const pdf = sanitizeImageUrl(event.pdfLink ?? "");
  if (pdf && /\.pdf($|[?#])/i.test(pdf)) return { kind: "link", url: pdf };
  if (pdf) return { kind: "content", pamphletImage: pdf };

  return { kind: "none" };
}

/**
 * Route params carried across the card->pamphlet seam (EventCard's handlePress -> event-detail.tsx's
 * useLocalSearchParams). Typed and shared by both sides (via openEventTap.ts) so a renamed/dropped
 * key is a compile error on whichever side didn't change, not a silently blank pamphlet screen.
 */
export interface EventDetailParams {
  // Index signature -- required for structural assignability to expo-router's own
  // UnknownInputParams (Record<string, ...>). Doesn't weaken the rename/typo guard below: TS still
  // flags a missing *required* key (e.g. featuredImage renamed away) regardless of this signature;
  // it only stops flagging an unrelated *extra* key, which isn't the failure mode being guarded.
  [key: string]: string;
  title: string;
  featuredImage: string;
  pamphletImage: string;
  expirationDate: string;
  isFeatured: string;
}

/** "Through <Month Day>" from a DiningEvent's expirationDate, or null if absent -- shared between
 * the Social pane's event card and the in-app pamphlet detail screen so the two don't drift. */
export function eventDateLine(expirationDate: string): string | null {
  if (!expirationDate) return null;
  return `Through ${new Date(expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
