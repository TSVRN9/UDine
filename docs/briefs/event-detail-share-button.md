# Share button on the event detail screen

Goal: a user viewing an in-app event (the pamphlet/poster detail screen) can share it via the OS
share sheet, instead of having no way to send it to someone else at all.

## Spec

UI: `docs/design/EventsPanePress.dc.html` (maps to `panes/EventsPane.tsx`, `app/event-detail.tsx`
per `docs/design/README.md`'s table) — the artboard does not depict a share icon anywhere; this is
new chrome, not a canvas iteration. No new artboard needed: the share button lands in
`event-detail.tsx`'s native Stack header (`headerRight`), which isn't part of the `.dc.html` body
mockups at all — every other `headerShown: true` screen in this app (`filters`, `favorites`,
`press`, `newsletter`) uses the same plain native header with no custom canvas art behind it.
Annotations: none.
States:
- Event detail screen open, share tapped — OS share sheet appears with the event's title and a
  link to its poster image.
- No states to gate on (no loading/error/empty — the button is always present once the screen
  itself has rendered, since by the time this screen exists `item.title`/`target.pamphletImage`
  are already known, passed in via route params).
Routes: `event-detail` isn't independently reachable by a bare screenshot.sh route the way hall
screens are (it's pushed with route params from a card tap, not a top-level nav target) — a
screenshot isn't the right evidence here anyway, since `Share.share()` opens a native OS sheet
that isn't part of the app's own rendered tree and can't be meaningfully captured by
`screenshot.sh`. Evidence is a test asserting the button calls `Share.share` with the right
payload (see Acceptance).

Backend: none.
Residency: none — no client→Supabase call, no new persisted data. `DiningEvent` (title, poster
image URL, expiration date) is already public UMass Dining content fetched anonymously
(`get_beacons_events`, no account needed) — sharing it raises no privacy concern the way sharing a
user's own log/macro data would.
Rationale: `mobile/src/lib/eventTapTarget.ts`'s `classifyEventTap` splits every `DiningEvent` into
two tap destinations: `"link"` (a real `externalLink`, opened via `expo-web-browser`'s
`openBrowserAsync` — never touches `event-detail.tsx` at all) and `"content"` (no external link,
just a same-origin poster image via `pdfLink`, pushed to `event-detail.tsx`). Only the `"content"`
path currently has zero way to share — a `"link"` event already gets full OS-native sharing for
free the moment a user opens it in the in-app browser (every mobile browser chrome has its own
share button), so extending this brief to that path would duplicate capability that already
exists elsewhere, not add anything. Scoping this to `event-detail.tsx`'s header is therefore both
the smallest change and the one that actually closes a real gap, not the only technically-possible
placement (a per-card share icon in `EventsPane.tsx`'s `EventCard` list was considered and
rejected: every card is already a single full-card `Press` tap target with no secondary
icon-button slot, so adding one there means nesting a second touchable inside the card's own —
more UI surface and more test surface for a capability the header already covers for the one path
that needs it).

Uses React Native's core `Share` module (`Share.share({ message, url })`) — no new dependency;
`expo-sharing` (already a dependency, used by `mobile/src/lib/exportShare.ts`) is for sharing
*files* the app has written to disk, not for the OS share-sheet-with-text-and-link this brief
needs, so it's the wrong tool despite the similar name. **Platform quirk to get right**: on
Android, `Share.share()`'s `url` field is silently ignored — only `message` is shown, so the link
must be embedded directly in the message text (e.g. `` `${title}\n${pamphletImage}` ``) for the
share to actually carry a link on Android; `url` can additionally be set for iOS's nicer
link-preview handling, but isn't sufficient by itself cross-platform.

## Acceptance

- [ ] `event-detail.tsx`'s native header shows a share affordance (icon or text button, matching
      the app's existing lightweight icon-as-text convention already used for the trailing
      chevron/external-link glyphs in `EventsPane.tsx`'s `EventCard` — no new `react-native-svg`
      icon needed unless the implementer judges a real glyph reads better here) — evidence: test
- [ ] Tapping it calls `Share.share` with a message that includes both the event's title and the
      poster image URL as plain text (so the link works on Android, not just iOS) — evidence: test
- [ ] `Share.share`'s rejection path (user dismisses the share sheet, or the OS call throws) is
      swallowed silently, not surfaced as an error alert — this is normal cancel behavior, not a
      failure, matching how `Share.share`'s promise resolves with `{ action: "dismissedAction" }`
      on iOS cancel rather than rejecting; only a genuine thrown error needs a catch at all, and it
      should no-op rather than alert (unlike `openEventTap.ts`'s link-open failure, which DOES
      alert because a broken link is a real problem the user asked to fix by tapping again — a
      dismissed share sheet isn't) — evidence: test

## Tasks

1. Add a `headerRight` share button to `mobile/src/app/event-detail.tsx`'s `Stack.Screen` options
   (in `mobile/src/app/_layout.tsx`, or via `useNavigation().setOptions()` inside
   `event-detail.tsx` itself if that's cleaner given the route params it needs — implementer's
   call, both are established expo-router patterns). Wire it to `Share.share({ message:
   \`${title}\n${pamphletImage}\`, url: pamphletImage })` using the same `title`/`pamphletImage`
   params the screen already receives. Full red-green TDD. — files: `mobile/src/app/event-detail.tsx`,
   `mobile/src/app/_layout.tsx` (only if the header option lives there instead),
   `mobile/src/app/event-detail.test.tsx` (new — confirmed no test file exists for this screen yet;
   `mobile/src/app/` currently has zero `.test.tsx` files at all) — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm lint` —
   blocked by: none — PR:
