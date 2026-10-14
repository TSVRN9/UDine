# Flutter port: café PDF menus

Goal: a café that publishes its menus as PDFs (The Commonwealth Restaurant has four) shows them as rows on its
page. Each opens as a page the user can pinch and double-tap to read. A menu opened once, or any menu of a pinned
café, opens offline.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Design approved by the owner on 2026-10-14 (#562).

## Spec

UI: M2 R11 §3 (`CONCEPT.md` "Round 11", section 3), NOTES "Round 11b" (zoom, the fixed bar).
- **Page order (as built):** the header, then "Menus" with Lunch, Lite fare, Dinner and Dessert, then Add a custom
  food, then the café's description, so the rows are above the fold at 360.
- **A menu page** is titled "<Name> menu" ("Lunch menu").
- **Loading:** the activity indicator after 400 ms, then the pages fade in where they end up.
- **A menu opens** as a pushed page of its pages at screen width. Pinch zooms 1× to 4×. Double-tap zooms to 2.5×
  at the point tapped, and double-tap again returns to 1×. The pages scroll inside the body; the bar (back and
  title) and the tab bar stay whole and fixed at every zoom.
- **Offline:**
  - a menu opened before is kept on the phone and opens offline;
  - a menu never opened shows "Not saved" on its row (in the schedule's slate colour), and its page says "You're offline, and this menu isn't
    saved on this phone.";
  - pinned cafés' menus and PDFs are fetched when the app opens (owner, 2026-10-14), so they never say "Not
    saved".
- **Failed:** "The lunch menu didn't load." with Try again.

Annotations: none.
States:
- the café with menu rows;
- a menu page loading;
- a menu page at 1×, at 2.5×, and at 2.5× scrolled sideways;
- offline with saved and unsaved rows;
- an offline unsaved page;
- failed;
- a pinned café offline.

Routes: `/cafe/<commonwealth id>`, `/cafe/<id>/menu/<n>`, in recorded mode with recorded PDFs.

Backend: none. The PDFs come from the retail feed's links, host-gated to umassdining.com (`core/content.dart`).
Residency: none (public menus). PDFs are cached in the app's files directory, one file per URL, replaced when the
feed's URL changes, pruned with the cafés' menu cache.
Rationale:
- **Where The Commonwealth comes from:** it's in get_infov2 like any café (`flutter-port-menu-data`); M2 appended
  it as `c29` so no place key moved. The Flutter places table (`core/m2/places.dart`) must include it.
- **Every PDF, not the first.** The retail parser must return every PDF link a café lists. RN's parser shows only
  the first, which is why The Commonwealth's four menus were hidden. The Dart parser changes. The TS one is RN's
  and stays as is.
- **Rendered natively.** Pages are rendered to images on the device with a PDF renderer package (`pdfx` or
  `printing`; name the choice and why in the PR), not a WebView with pdf.js as RN does. That keeps M2's
  back gesture and zoom.
- **Recorded PDFs.** The PDFs are UMass's documents. The recorded mode serves them from the gitignored
  `local/pdf/`, linked like the photos (`app/tool/link_photos.sh`), and they are never committed. Captures of a
  PDF page are UMass content too: keep them out of `docs/pr-review-media` unless the page shown is the
  "not saved" or failed state.

## Acceptance

- [ ] The parser returns all PDF links for The Commonwealth (4) with the host gate — evidence: test
- [ ] Rows, page, zoom (pinch 1–4×, double-tap 2.5×/1×) and a fixed bar at every zoom — evidence: test
  (bar rect unchanged at 1×, 2.5× and scrolled) + goldens of the non-PDF states
- [ ] An opened menu and a pinned café's menus open offline; an unsaved one shows "Not saved" — evidence: test
- [ ] Failed shows the retry — evidence: test

## Tasks

1. **Parser, fetch and cache:** all PDF links, the file cache, prefetch for pinned cafés, recorded PDFs — files:
   `app/lib/core/content.dart`, `app/lib/data/` — lanes: flutter — blocked by: halls 2, menu-data 1 — PR:
2. **Rows and page:** the rows, the PDF page with zoom, the offline and failed states — files:
   `app/lib/screens/cafes/` — lanes: flutter — blocked by: 1 — PR:
