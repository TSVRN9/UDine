# Event share sends only the photo

Goal: tapping SHARE on the event detail screen hands the OS share sheet the event's expanded photo
(the pamphlet/poster image the screen already shows) as an image file — no title text, no link. A
recipient gets the picture and nothing else.

## Spec

UI: none new. `EventDetailOptionA.dc.html` (the SHARE pill and the screen) is unchanged; only what
the pill hands to the OS changes. The share sheet is OS chrome, not app-rendered output.
Annotations: `event-detail-share-options` (context only; the pill/header decision is already
implemented in #510 and is not reopened).
States: pamphlet download succeeds → share sheet opens with the image; download fails (offline, non-2xx)
→ nothing opens, no alert (same silent no-op the screen has today for a failed share); sharing
unavailable (web) → nothing. Share-sheet dismissed → nothing.
Routes: none needed — no rendered-output diff, so no `screenshot.sh` frame is required. Verify by
tapping SHARE on a real event on the emulator/device (`event-detail`, reached from the Events pane)
and confirming the sheet's preview is the poster image with no text; note the result in the PR body.

Backend: none.
Residency: none — the image is a public UMass asset fetched straight from UMass Dining into the
cache dir; no user data, no new call to Supabase.

Rationale: today's `handleShare` (`mobile/src/app/event-detail.tsx`) calls RN's `Share.share` with
`{ message: "<title>\n<url>", url }`. RN's `Share` can only send text/URLs — never image bytes — and
Android drops `url` entirely, which is why the link was embedded in the message. Sending "just the
photo" therefore means sending a file: download `pamphletImage` to `FileSystem.cacheDirectory` and
pass the local URI to `Sharing.shareAsync` with an image mimeType. Both `expo-file-system/legacy`
`downloadAsync` and `expo-sharing` are already installed and used the same way in
`mobile/src/components/CafePdfViewer.tsx` and `mobile/src/lib/exportShare.ts` — no new dependency.
Rejected alternative: keep `Share.share` and send the URL alone — that is still a link (the thing
being removed), and on Android it would render as text, not a photo.

## Acceptance

- [ ] Tapping SHARE downloads `pamphletImage` to the cache dir and calls `Sharing.shareAsync` with the local file URI and an image mimeType derived from the URL's extension (jpg/jpeg→`image/jpeg`, png→`image/png`, fallback `image/jpeg`) — evidence: test
- [ ] `Share.share` is no longer called by the screen; no title, message, or URL string is passed to any share API — evidence: test (asserts `Share.share` not called and `shareAsync` args contain only the file URI + mimeType/UTI)
- [ ] A non-2xx download (`downloadAsync` resolves with `status` ≥ 400) does not open the share sheet and does not alert — evidence: test (the error-page bytes must never be shared)
- [ ] A thrown download or share error is swallowed without an alert; `Sharing.isAvailableAsync() === false` skips sharing — evidence: test
- [ ] The SHARE pill, header, and screen layout are untouched — evidence: existing `eventDetailScreen.test.tsx` artboard-parity tests still pass unchanged
- [ ] On a real device/emulator, the share sheet preview is the poster image only, with no text or link attached — evidence: PR body note (manual; OS chrome can't be screenshotted by `screenshot.sh`)

## Tasks

1. Replace `handleShare` with download-to-cache + `Sharing.shareAsync` (image mimeType); delete the `Share` import and the Android-drops-`url` comment; update the "share pill" describe block in `eventDetailScreen.test.tsx` (red first: assert `shareAsync` is called with a `file://` cache URI and `Share.share` is not) — files: `mobile/src/app/event-detail.tsx`, `mobile/src/lib/eventDetailScreen.test.tsx` — lanes: mobile (jest + tsc, per `ci.yml` header) — blocked by: none — PR:
