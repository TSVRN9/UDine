import type { DiningEvent, NewsletterIssue, PressRelease } from "./types.ts";

const BASE = "https://www.umassdining.com/uapp";

/**
 * #150: pdf_link/external_link render straight into `<a href=…>` (web) with no protocol check --
 * unlike featured_image, which goes through sanitizeImageUrl below. A javascript:/data: value in
 * the feed would execute in the app origin on click. Scheme allowlist, not sanitizeImageUrl's
 * hostname check -- hostname alone is bypassable by an authority-faking URL like
 * `javascript://example.com/%0aalert(1)`, which parses a normal-looking hostname.
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
 * #178: strips a third-party feed's HTML fragment down to plain text -- the trust-boundary fix for
 * RetailLocationHours' description/address/*_menu fields (#176), which are raw HTML straight off
 * get_infov2, same as the fields sanitizeLinkUrl/sanitizeImageUrl already guard above. No DOM
 * parser: this runs in web (browser), mobile (Hermes/RN, no DOM) and shared's own node:test suite
 * alike, so it's a scan-and-strip pass over the tag grammar these feeds actually use (<p>/<br>/<a>/
 * <span>, confirmed live -- see hours.test.ts's real captures), not a general HTML5 parser. <script>/
 * <style> are dropped ENTIRELY, tag and body both -- everything else's tag is stripped but its text
 * content stays (that's the point), and those two are the one case where the body itself must not
 * leak as visible text. <br> and block-closing tags become a newline first so multi-line content
 * (e.g. an address, or a <br>-separated item list -- see parseRetailMenuHtml's own #178 pr-review fix)
 * doesn't collapse into one run-on line; blank lines from empty blocks are dropped.
 *
 * Output contract: plain text ONLY. Entities are decoded (correctly) after tags are stripped, so a
 * source string like `&lt;script&gt;` -- someone's literal, escaped-safe text -- comes back out as
 * the real characters `<script>`. That's correct text extraction, but it means this function's
 * return value can contain characters that look like markup. NEVER pass this output to `{@html}`,
 * `dangerouslySetInnerHTML`, or a WebView's `innerHTML`/`postMessage`-into-HTML -- it is text, not a
 * sanitized-HTML string, and treating it as the latter reopens exactly the injection this function
 * exists to close off.
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

// #178 pr-review: exact-host or real-subdomain match only -- `endsWith(".umassdining.com")`, not a
// bare `.includes("umassdining.com")`, which a URL like `https://umassdining.com.evil.example/x.pdf`
// would also satisfy despite resolving to `evil.example`, not us.
function isUmassDiningHost(url: string): boolean {
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
 * #178: parses one of RetailLocationHours' breakfastMenu/lunchMenu/dinnerMenu HTML fragments (#176)
 * into a safe, structured shape -- NOT a sanitize-and-{@html} pass. #178's own instruction is that
 * parsing to text/structured nodes is the preferred trust-boundary fix here, not a fallback, so this
 * is what both clients render; the raw HTML never reaches a template. Two real shapes confirmed live
 * (hours.test.ts): a PDF link (babyBerk/Commonwealth Restaurant wrap one <a href=*.pdf> in a <p>, no
 * item list) or a plain item list. That item list itself has two real sub-shapes (pr-review finding
 * on this ticket, live-measured against Argo Tea #9605, Peet's #4311, Courtside #18): People's
 * Organic's capture is one dish per `<p>...</p>` block, but several real cafés instead pack their
 * WHOLE menu into a single block with `<br>`-separated lines (e.g. `<p>Coffee $2.00<br>Tea
 * $2.50<br>...</p>`) -- splitting on block-closing tags alone folded all of those into one giant
 * multiline "item", and the price regex below only ever matched (or missed) the LAST line of that
 * blob, so every other `$price` on the same block was swallowed into `name` and came back null.
 * Splitting each block's plain text on its own embedded newlines (htmlToText turns both `<br>` and
 * nested block-closers into "\n") before the price regex runs fixes both real shapes at once -- a
 * name-only row (no `<br>`, one line per block) is still a real, expected result, not a parsing gap.
 */
export function parseRetailMenuHtml(html: string | null | undefined): ParsedRetailMenu {
  if (!html) return { kind: "empty" };

  const linkMatch = /<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (linkMatch) {
    const href = linkMatch[1];
    // #178 pr-review: the `.pdf` check alone is decorative -- `/\.pdf(?:[?#]|$)/` tests the raw
    // href, so `https://evil.example/redir?to=x#.pdf` passes it, and both clients feed this straight
    // into a PDF viewer (web: `<object data=...>`) that renders whatever Content-Type the server
    // actually sends, `.pdf`-looking URL or not -- `type="application/pdf"` is only a hint, the
    // response wins. Require the URL's real hostname to BE (or end in, e.g. a CDN subdomain)
    // umassdining.com before trusting it as a pdf link at all -- the same authority check
    // sanitizeLinkUrl's own doc comment already warns a naive host-substring/prefix check can't be
    // trusted for.
    if (/\.pdf(?:[?#]|$)/i.test(href) && isUmassDiningHost(href)) {
      const url = sanitizeLinkUrl(href);
      if (url) return { kind: "pdf", url, label: htmlToText(linkMatch[2]) || "Menu" };
    }
  }

  const items = html
    .split(/<\/(?:p|li|div)>/i)
    .flatMap((chunk) => htmlToText(chunk).split("\n"))
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?)\s+(\$\d+(?:\.\d{2})?)$/.exec(line);
      return m ? { name: m[1].trim(), price: m[2] } : { name: line, price: null };
    });

  return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
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
  // `beacons` also present in the response — intentionally ignored, see docs/apk-reverse-engineering.md
  // (BLE check-ins are a non-goal for v1, but the events feed itself needs no beacon data).
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

/** GET /uapp/get_beacons_events — confirmed live. Returns only the `events` array; beacons are dropped. */
export async function fetchEvents(): Promise<DiningEvent[]> {
  const res = await fetch(`${BASE}/get_beacons_events`);
  if (!res.ok) throw new Error(`get_beacons_events ${res.status}`);
  const data = (await res.json()) as EventsApiResponse;
  return data.events.map(mapEvent);
}

/**
 * GET /uapp/get_newsletter — confirmed live (2026-08-18). Response fields already match
 * NewsletterIssue directly, so shape passes through untouched — the only mapping is #150's
 * `link` scheme sanitization, same trust boundary as pdf_link/external_link/press url above, and
 * web renders `link` straight into `<a href=…>`. This is a list of links to externally-hosted
 * newsletter issues (mostly Mailchimp/campaign-archive) — `content` is usually empty, real
 * content lives at `link`. See CLAUDE.md/issue #33.
 */
export async function fetchNewsletter(): Promise<NewsletterIssue[]> {
  const res = await fetch(`${BASE}/get_newsletter`);
  if (!res.ok) throw new Error(`get_newsletter ${res.status}`);
  const data = (await res.json()) as NewsletterIssue[];
  return data.map((issue) => ({ ...issue, link: sanitizeLinkUrl(issue.link) }));
}
