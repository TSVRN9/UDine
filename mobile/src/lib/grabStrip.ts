import type { OpenStatus, RetailLocationHours } from "@udine/shared";
import { formatTime, retailOpenStatus } from "./homeHero";

/** Finds a hall's Grab 'N Go entry among get_infov2's retail locations (#116's spec: the strip's
 * open/closed state comes from the shared hours client, same feed the café/market rows already
 * use). Matches by "starts with the hall name" + a loose, case-insensitive "grab" substring rather
 * than the exact live title -- a live capture (2026-08-20) confirmed the feed uses a smart
 * apostrophe ("Worcester Grab ‘N Go", U+2018, not a straight "'"), which a literal string match
 * would silently miss. */
export function findGrabNGoLocation(retail: RetailLocationHours[], hallName: string): RetailLocationHours | null {
  return retail.find((r) => r.name.startsWith(hallName) && /grab/i.test(r.name)) ?? null;
}

/** Grab strip copy per the canvas ("open til 7:00 PM" / "closed · opens 4:30 PM") -- lowercase and
 * "til", deliberately distinct from the hall status pill's uppercase "OPEN · CLOSES ..."
 * (formatLocationChip in homeHero.ts). Reuses formatTime so both pieces of copy agree on how a
 * time renders. */
export function formatGrabStripText(status: OpenStatus): string {
  if (status.open) return `open til ${formatTime(status.closesAt)}`;
  if (status.opensAt) return `closed · opens ${formatTime(status.opensAt)}`;
  return "closed";
}

/** Combines the lookup + shared open/close math + copy into what the Home split card needs to
 * render its strip. No matching Grab 'N Go location -> closed, no hours text (nothing to show). */
export function grabStripState(retail: RetailLocationHours[], hallName: string, now: Date): { open: boolean; text: string } {
  const loc = findGrabNGoLocation(retail, hallName);
  if (!loc) return { open: false, text: "" };
  const status = retailOpenStatus(loc, now);
  return { open: status.open, text: formatGrabStripText(status) };
}

/** The Grab 'N Go screen route (#115, built in a sibling ticket) -- `/grab-n-go/[slug]`, per #115's
 * discovery-step comment: NOT nested under `/halls/[slug]` because expo-router doesn't allow both a
 * `[slug].tsx` file and a `[slug]/` directory at the same segment, and staying independent of
 * `/halls/[slug]` keeps this route unaffected by #117's in-flight hall-menu header rework. */
export function grabRouteFor(hallSlug: string): string {
  return `/grab-n-go/${hallSlug}`;
}
