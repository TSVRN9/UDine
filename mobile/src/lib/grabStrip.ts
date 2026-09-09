import type { DiningHall, OpenStatus, RetailLocationHours } from "@udine/shared";
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

/** Drops each hall's own Grab 'N Go entry from a retail list. Each hall's Grab 'N Go station is
 * already surfaced via that hall's own card strip (grabStripState/grabRouteFor above) -- without
 * this, a generic retail listing (e.g. "Cafés & Markets") shows the same location twice, once
 * folded into its hall's card and again as if it were an unrelated standalone café. */
export function excludeGrabNGoLocations(retail: RetailLocationHours[], halls: DiningHall[]): RetailLocationHours[] {
  const excludedNames = new Set(
    halls.map((hall) => findGrabNGoLocation(retail, hall.name)?.name).filter((name): name is string => name != null),
  );
  return retail.filter((r) => !excludedNames.has(r.name));
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

/** Deep-links into the hall-menu screen with its Grab 'N Go tab preselected. The standalone
 * `/grab-n-go/[slug]` route (#115) is retired -- Grab 'N Go is now the hall-menu screen's 4th tab
 * (per the artboard's "DECIDED" spec), reusing the same station-grouped rendering, plate, and log
 * pipeline instead of a forked screen. */
export function grabRouteFor(hallSlug: string): string {
  return `/halls/${hallSlug}?meal=grab`;
}
