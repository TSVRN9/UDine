import type { DiningEvent, NewsletterIssue, PressRelease } from "./types.ts";

const BASE = "https://www.umassdining.com/uapp";

/**
 * pdf_link/external_link render straight into `<a href=…>` (web) with no protocol check -- a
 * javascript:/data: value in the feed would execute in the app origin on click. Scheme allowlist,
 * not sanitizeImageUrl's hostname check -- hostname alone is bypassable by an authority-faking URL
 * like `javascript://example.com/%0aalert(1)`, which parses a normal-looking hostname.
 */
export function sanitizeLinkUrl(url: string): string {
  if (!url) return "";
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

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

/**
 * Strips a third-party feed's HTML fragment down to plain text -- the trust-boundary fix for raw
 * HTML fields straight off get_infov2. No DOM parser: this runs in web (browser), mobile (Hermes/
 * RN, no DOM) and shared's own node:test suite alike, so it's a scan-and-strip pass over the tag
 * grammar these feeds actually use (<p>/<br>/<a>/<span>), not a general HTML5 parser. <script>/
 * <style> are dropped ENTIRELY, tag and body both -- everything else's tag is stripped but its text
 * content stays. <br> and block-closing tags become a newline first so multi-line content doesn't
 * collapse into one run-on line.
 *
 * Output contract: plain text ONLY. Entities are decoded after tags are stripped, so the return
 * value can contain characters that look like markup (e.g. a literal `&lt;script&gt;` decodes to
 * `<script>`). NEVER pass this output to `{@html}`, `dangerouslySetInnerHTML`, or a WebView's
 * `innerHTML` -- it is text, not a sanitized-HTML string.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&rsquo;/gi, "’")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

// Exact-host or real-subdomain match only -- `endsWith(".umassdining.com")`, not a bare
// `.includes("umassdining.com")`, which a URL like `https://umassdining.com.evil.example/x.pdf`
// would also satisfy despite resolving to `evil.example`, not us. Exported so other callers (e.g.
// a PDF proxy route) can apply the same host gate instead of re-deriving their own version.
export function isUmassDiningHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "umassdining.com" || hostname.endsWith(".umassdining.com");
  } catch {
    return false;
  }
}

export interface RetailMenuPdf {
  kind: "pdf";
  url: string;
  label: string;
}

export interface RetailMenuItems {
  kind: "items";
  items: { name: string; price: string | null }[];
}

export interface RetailMenuEmpty {
  kind: "empty";
}

export type ParsedRetailMenu = RetailMenuPdf | RetailMenuItems | RetailMenuEmpty;

/**
 * Parses one of RetailLocationHours' breakfastMenu/lunchMenu/dinnerMenu HTML fragments into a safe,
 * structured shape -- NOT a sanitize-and-{@html} pass; the raw HTML never reaches a template. Two
 * real shapes: a PDF link (one <a href=*.pdf> wrapped in a <p>, no item list) or a plain item list.
 * The item list has two sub-shapes: one dish per `<p>...</p>` block, or a whole menu packed into a
 * single block with `<br>`-separated lines. Splitting each block's plain text on its own embedded
 * newlines (htmlToText turns both `<br>` and nested block-closers into "\n") before the price regex
 * runs handles both shapes -- a name-only row (no `<br>`) is a real, expected result, not a gap.
 */
export function parseRetailMenuHtml(html: string | null | undefined): ParsedRetailMenu {
  if (!html) return { kind: "empty" };

  const linkMatch = /<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (linkMatch) {
    const href = linkMatch[1];
    // The `.pdf` check alone is decorative -- both clients feed this into a PDF viewer that renders
    // whatever Content-Type the server actually sends, `.pdf`-looking URL or not. Require the URL's
    // real hostname to be (or end in) umassdining.com before trusting it as a pdf link at all.
    if (/\.pdf(?:[?#]|$)/i.test(href) && isUmassDiningHost(href)) {
      const url = sanitizeLinkUrl(href);
      if (url) return { kind: "pdf", url, label: htmlToText(linkMatch[2]) || "Menu" };
    }
  }

  // Some captures wrap a section LABEL in <strong>, not a dish, with every real item line in that
  // block plain text. Stripping <strong>/<b> tags AND their content before splitting into lines
  // removes the heading structurally instead of pattern-matching its specific wording.
  const withoutHeadings = html.replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  function extractItems(source: string) {
    return source
      .split(/<\/(?:p|li|div)>/i)
      .flatMap((chunk) => htmlToText(chunk).split("\n"))
      .filter(Boolean)
      .map((line) => {
        const m = /^(.*?)\s+(\$\d+(?:\.\d{2})?)$/.exec(line);
        return m ? { name: m[1].trim(), price: m[2] } : { name: line, price: null };
      });
  }

  const items = extractItems(withoutHeadings);
  // If a café ever bolds its entire item list instead of just a label, the strip above would empty
  // it to nothing. Prefer the unstripped result in that case -- a menu with an un-filtered heading
  // line is a much smaller problem than a menu that disappears.
  if (items.length === 0) {
    const unstripped = extractItems(html);
    if (unstripped.length > 0) return { kind: "items", items: unstripped };
  }

  return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
}

interface PressApiItem {
  title: string;
  url: string;
  image: string;
  date: string;
}

/** GET /uapp/get_press. */
export async function fetchPressReleases(): Promise<PressRelease[]> {
  const res = await fetch(`${BASE}/get_press`);
  if (!res.ok) throw new Error(`get_press ${res.status}`);
  const data = (await res.json()) as PressApiItem[];
  return data.map((item) => ({ ...item, image: sanitizeImageUrl(item.image), url: sanitizeLinkUrl(item.url) }));
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
  // `beacons` also present in the response — intentionally ignored (BLE check-ins are a non-goal
  // for v1).
}

export function mapEvent(e: EventsApiResponse["events"][number]): DiningEvent {
  return {
    title: e.title,
    featuredImage: sanitizeImageUrl(e.featured_image),
    pdfLink: sanitizeLinkUrl(e.pdf_link),
    externalLink: sanitizeLinkUrl(e.external_link),
    expirationDate: new Date(e.expiration_date * 1000).toISOString(),
    isFeatured: e.is_featured === "1",
  };
}

/** GET /uapp/get_beacons_events. Returns only the `events` array; beacons are dropped. */
export async function fetchEvents(): Promise<DiningEvent[]> {
  const res = await fetch(`${BASE}/get_beacons_events`);
  if (!res.ok) throw new Error(`get_beacons_events ${res.status}`);
  const data = (await res.json()) as EventsApiResponse;
  return data.events.map(mapEvent);
}

/**
 * GET /uapp/get_newsletter. Response fields already match NewsletterIssue directly, so shape
 * passes through untouched -- the only mapping is `link` scheme sanitization, same trust boundary
 * as pdf_link/external_link/press url above. This is a list of links to externally-hosted
 * newsletter issues -- `content` is usually empty, real content lives at `link`.
 */
export async function fetchNewsletter(): Promise<NewsletterIssue[]> {
  const res = await fetch(`${BASE}/get_newsletter`);
  if (!res.ok) throw new Error(`get_newsletter ${res.status}`);
  const data = (await res.json()) as NewsletterIssue[];
  return data.map((issue) => ({ ...issue, link: sanitizeLinkUrl(issue.link) }));
}
