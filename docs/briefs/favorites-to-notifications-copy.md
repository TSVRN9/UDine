# Rename "favorite foods" UI copy to "notifications"

Goal: the user-visible language around favoriting a dish/hall for alerts says "notifications", not
"favorites" — "favorite" reads as a rating, which is exactly the ambiguity the bell icon (not a
star) already exists to avoid; spelling it out in the visible label is clearer than relying on the
icon alone, and matches the term the web app already uses for the same concept
(`web/src/routes/notifications/+page.svelte`, which already merges favorited-food sightings and
friend pings into one "notifications" feed).

Scope is UI copy only — screen titles, section headers, nav/link labels, empty-state text. The
underlying names stay exactly as they are: the `Favorite` type, `FavoritesStorage`,
`favorited_foods`/`food_sightings` tables, RLS policies, `useGuardedToggleFavorite`, etc. This is
deliberate, not a shortcut — `favorited_foods` is a live production table; renaming it is a real
migration with its own review path (`supabase/`, owner-gated), and nothing about this brief needs
it. A future brief can revisit the internal names if the owner wants full consistency later.

## Spec

UI: `YouPaneGrouped.dc.html` (component: `mobile/src/panes/YouPane.tsx`) — no new layout, text-only
change, so no new artboard needed; cite the existing one for context only.
Annotations: none
States: none (copy change, not a new state)
Routes: none — no rendered-output screenshot needed for a pure text swap this small... except
this repo's gate treats any `.tsx` diff with a real (non-comment) line change as rendered output,
so a screenshot IS still required by `scripts/pr-gate.sh` — capture `mobile/scripts/screenshot.sh`
against the You pane (reach it via the pane swipe gesture, see recent PRs for the pattern) and
against `/favorites` if its title changes too.

Backend: none
Residency: no change — copy-only
Rationale: copy-only scope chosen over a full rename (type/table/RLS) specifically so this ships
fast and independent of `eager-caching-and-notifications` (the two don't share code) and never
touches `supabase/` — a renamed live table is real migration risk for zero functional benefit here.

## Acceptance

- [ ] The You pane's "Favorites" section header reads "Notifications" (or an equivalent the owner
      prefers if this is presented for a quick check before landing) — evidence: screenshot
- [ ] The `/favorites` route's screen title (`mobile/src/app/_layout.tsx`'s `Stack.Screen` options)
      reads "Notifications" — evidence: screenshot
- [ ] No other visible string on either screen still reads "favorite"/"favorites" in a way that
      describes this feature (a `grep -rn` for the old copy across both touched files, pasted into
      the PR body, showing zero remaining hits outside of code-level identifiers) — evidence: test
      (grep output) + screenshot
- [ ] Code-level identifiers (`Favorite` type, `FavoritesStorage`, `favorited_foods`,
      `useGuardedToggleFavorite`, route filename `favorites.tsx`) are unchanged — evidence: test
      (a `git diff` scope check — no non-`.tsx`-copy files touched, no renamed exports)

## Tasks

1. Rename visible copy on the You pane and the `/favorites` screen — files:
   `mobile/src/panes/YouPane.tsx`, `mobile/src/app/_layout.tsx`, `mobile/src/app/favorites.tsx`
   (check for any other visible "favorite" strings while in this file, e.g. its own empty-state
   text) — lanes: `cd mobile && npx tsc --noEmit && TZ=America/New_York npx jest && pnpm --filter
   mobile lint` — blocked by: none — PR:
