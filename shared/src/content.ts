import type { DiningEvent, NewsletterIssue, PressRelease } from "./types.ts";

const BASE = "https://www.umassdining.com/uapp";

/**
 * UMass Dining's press/events feeds sometimes return an image URL with a literal host of
 * `default` (e.g. `https://default/sites/default/files/press/images.png`) -- present and
 * truthy, but unresolvable. Blank anything without a plausible hostname (must contain a dot,
 * or be localhost) so callers get a clean "no image" signal instead of a dead URL that trips
 * `{#if image}`-style truthiness guards and renders a broken-image glyph.
 */
export function sanitizeImageUrl(url: string): string {
  if (!url) return "";
  try {
    const { hostname } = new URL(url);
    if (hostname === "localhost" || hostname.includes(".")) return url;
    return "";
  } catch {
    return "";
  }
}

interface PressApiItem {
  title: string;
  url: string;
  image: string;
  date: string;
}

/** GET /uapp/get_press — confirmed live, see docs/apk-reverse-engineering.md. */
export async function fetchPressReleases(): Promise<PressRelease[]> {
  const res = await fetch(`${BASE}/get_press`);
  if (!res.ok) throw new Error(`get_press ${res.status}`);
  const data = (await res.json()) as PressApiItem[];
  return data.map((item) => ({ ...item, image: sanitizeImageUrl(item.image) }));
}

interface EventsApiResponse {
  events: {
    title: string;
    featured_image: string;
    pdf_link: string;
    external_link: string;
    expiration_date: number; // unix seconds
    is_featured: string; // "0" | "1"
  }[];
  // `beacons` also present in the response — intentionally ignored, see docs/apk-reverse-engineering.md
  // (BLE check-ins are a non-goal for v1, but the events feed itself needs no beacon data).
}

export function mapEvent(e: EventsApiResponse["events"][number]): DiningEvent {
  return {
    title: e.title,
    featuredImage: sanitizeImageUrl(e.featured_image),
    pdfLink: e.pdf_link,
    externalLink: e.external_link,
    expirationDate: new Date(e.expiration_date * 1000).toISOString(),
    isFeatured: e.is_featured === "1",
  };
}

/** GET /uapp/get_beacons_events — confirmed live. Returns only the `events` array; beacons are dropped. */
export async function fetchEvents(): Promise<DiningEvent[]> {
  const res = await fetch(`${BASE}/get_beacons_events`);
  if (!res.ok) throw new Error(`get_beacons_events ${res.status}`);
  const data = (await res.json()) as EventsApiResponse;
  return data.events.map(mapEvent);
}

/**
 * GET /uapp/get_newsletter — confirmed live (2026-08-18). Response fields already match
 * NewsletterIssue directly, no mapping needed. This is a list of links to externally-hosted
 * newsletter issues (mostly Mailchimp/campaign-archive) — `content` is usually empty, real
 * content lives at `link`. See CLAUDE.md/issue #33.
 */
export async function fetchNewsletter(): Promise<NewsletterIssue[]> {
  const res = await fetch(`${BASE}/get_newsletter`);
  if (!res.ok) throw new Error(`get_newsletter ${res.status}`);
  const data = (await res.json()) as NewsletterIssue[];
  return data;
}
