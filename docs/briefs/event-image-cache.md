# Event images: kept on the phone, with a shimmer while one loads

Goal: an event's banner picture shows up at once on every visit after the first, offline too. While a picture
that isn't on the phone yet is loading, its felt patch shimmers instead of sitting blank and then popping in.

Owner request (2026-11-05, in chat): "cache event images on devices and display a shimmer placeholder".

Today `EventBanner` (`app/lib/screens/event/event_banner.dart`) uses `Image.network`. That cache lives in memory
only, so every cold start fetches the picture again, nothing shows offline, and the felt sits empty until the
bytes land.

## Spec

UI: M2 `.evpatch` (the Search event card, and the event page's framed banner), unchanged at rest. The shimmer is
new, and it **departs from M2 on purpose**. M2 says "no skeletons" for its loading states (CONCEPT.md §4, line 287).
The owner's request above overrides that **for the event banner only**. Nothing else gets a skeleton.
Annotations: none.

**Cache**: reuse `PdfCache` (`app/lib/data/pdf_cache.dart`), don't write a second one. Generalise it just enough
to hold images too. The parts that differ: the file extension, the host check (event pictures aren't only on
umassdining.com, since `sanitizeImageUrl` admits any host with a dot), and the body check. For images that check
is the magic bytes of JPEG, PNG, GIF or WebP, plus a size cap of about 5 MB. The rest stays as it is: one file per
URL (FNV name), `.part` then rename, a second ask joins the one in flight, and `prune(keep)`. The directory is the
app support dir's `events/`, created in `boot.dart` next to `pdf/`. Recorded mode uses a temp dir, like the PDFs.

**Warm at launch**: `Repository.launch` already drains `events()`. After it, fetch every listed event's picture
that isn't saved yet (through `pool`, failures swallowed, as `prefetchPdfs` does), and `prune` to the URLs the
feed lists. Skip all of it when `Photos.enabled` is off.

**Banner**: there are three states.
- **saved**: the file draws in the banner's first frame (`Image.file`), with no shimmer and no fade.
- **loading**: the felt (`M2Color.vm`) shows a shimmer under the stitch: a soft, lighter band sweeping across it on a
  loop. When the bytes land, the picture fades in where it ends up over `settle`, and the shimmer stops.
- **failed / offline and not saved**: the shimmer stops, and the felt and stitch remain, as today with photos off.

Photos off (`Photos.enabled == false`, every capture's default): no fetch and no shimmer, so the felt and stitch
are exactly as today.

Motion: the shimmer's period and curve are a new token in `app/lib/theme` (`M2Motion`/`MO`), never a literal. If
the platform's reduce-motion is on (`MediaQuery.disableAnimationsOf`), there is no sweep: the felt is a still,
slightly lighter loading tint.

States, each with a test; a screenshot or recording for those marked †:
- saved †
- loading, with the shimmer recorded †
- the picture landing (fade in, shimmer gone) †
- failed
- offline with a saved picture †
- offline with nothing saved
- photos off
- reduce-motion

To capture the shimmer, the picture needs to be held pending with photos off. Add a recorded-mode flag in
`data/recorded/flags.dart` (e.g. `evimg=pending`) that holds the fetch open, so the shimmer runs over the felt
with nothing of UMass's drawn. Never commit a capture with the real picture in it (repo is public).

Routes: `/search?data=recorded&at=2026-10-08T12:41&evimg=pending` (`--record 3`), and the event page from a card.

Backend: none.
Residency: event pictures are public UMass Dining content. They are kept device-only, like the menu cache, and
pruned when the feed drops them. This is a cache, not a user-data table, so it gets no export.
Rationale: the owner asked for an on-device cache and a shimmer. Reusing `PdfCache`'s file-per-URL design keeps it
to one cache in the app. Rejected:
- `cached_network_image` or another dependency: the app already has a disk cache that does this.
- `precacheImage` alone: memory only, so it's gone at the next cold start.

## Acceptance

- [ ] Cold start with the picture saved: the banner's first frame draws the picture; nothing is fetched — evidence: test
- [ ] Not saved: shimmer until the bytes land, then the picture fades in over `settle`; the shimmer is gone after — evidence: test + recording
- [ ] Launch saves every listed event's picture and prunes pictures the feed no longer lists — evidence: test
- [ ] A non-image body, an over-cap body, or a non-http(s) URL is refused and nothing is written — evidence: test
- [ ] Offline: a saved picture draws; an unsaved one shows the still felt, no endless shimmer — evidence: test
- [ ] Photos off: no request is made and no shimmer runs — evidence: test
- [ ] Reduce-motion: no sweep — evidence: test
- [ ] The shimmer's period and curve come from a theme token; no new literal (`test/literals_test.dart`) — evidence: test
- [ ] Existing PDF cache tests unchanged and green — evidence: test

## Tasks

1. Image cache, launch warm, and banner states — files: `app/lib/data/pdf_cache.dart`, `app/lib/data/repository.dart`,
   `app/lib/boot.dart`, `app/lib/data/recorded/{recorded,flags}.dart`, `app/lib/screens/event/event_banner.dart`,
   `app/lib/theme/` (token), tests under `app/test/data/` and `app/test/screens/` — lanes: `cd app && flutter analyze &&
   tool/test.sh test/data test/screens test/motion test/literals_test.dart test/core/m2`, `app/tool/screenshot.sh` for each †
   — blocked by: none — PR:
