# PlateSheet's auto-opened search sheet intermittently self-dismisses under a `--stress` fixture

Goal: an auto-open `--stress` fixture (e.g. `lookup-hit`, `catalog-refresh`) that programmatically
sets a query and drives search stays open reliably for the full capture, instead of intermittently
dismissing itself mid-search.

## Spec

UI: none — capture-reliability bug, not a rendered-output change.
Annotations: none.
States: n/a.
Routes: `halls/franklin --device Agent_Emulator_Wide --stress catalog-refresh --record 10
--record-nav` (repeat several times — this is intermittent, not deterministic).

Backend: none.
Residency: none.

Rationale: found and independently corroborated by `pr-reviewer` 2026-09-19 while reviewing PR #516
(`docs/briefs/plate-search-semantics.md`). The implementing agent for that PR first disclosed it
after hitting it while capturing decision 5's required device evidence: the auto-opened PlateSheet
self-dismisses a few seconds into a `--record-nav` capture under stress-fixture auto-open, plausibly
an IME-interaction artifact of setting the search query programmatically while the search box is
still focused/the keyboard is raised. `pr-reviewer` reproduced it independently: 2 attempts with the
new `catalog-refresh` fixture, 1 clean (used as the PR's evidence) and 1 self-dismissed at frame-035
(still mid-search, spinner up) → frame-040 (already back on the plain hall-menu screen), dismissal
firing ~3.3–3.8s in, **before** the fixture's own splice had even landed — so this isn't specific to
the new fixture's splice logic. **Not confirmed**: whether the already-shipped `lookup-hit` fixture
also reproduces this — one attempt each way (dismissed once on a fresh reproduction attempt, didn't
dismiss on a single `lookup-hit` retry) isn't conclusive; don't treat "predates this PR" as settled,
verify it directly.

This is a capture-reliability bug worth root-causing on its own, not just working around by
retrying captures until one is clean (the workaround PR #516 used, which is fine for that PR but
doesn't scale if this affects other auto-open fixtures going forward).

## Acceptance

- [ ] Root cause identified: why the sheet dismisses (a real close trigger firing, e.g. a
      backdrop-scrim tap event synthesized somewhere, a `Keyboard`/IME dismiss cascading into
      `onClose`, or something else) — evidence: instrumented repro, not guessed
- [ ] Reproduction rate before/after the fix, measured across a real sample (not "looked fine once")
      — evidence: N attempts before, N attempts after, on the same device/fixture
- [ ] Confirm or rule out whether `lookup-hit` (the pre-existing fixture) shares the same root cause
      — evidence: a real sample of attempts with that fixture specifically, not a single try

## Tasks

1. Root-cause and fix the intermittent self-dismiss under stress-fixture auto-open. — files:
   likely `mobile/src/components/PlateSheet.tsx` (the stress-fixture auto-open effects,
   `LOOKUP_STRESS_FIXTURES` and the new `catalog-refresh` case) — lanes: `cd mobile && npx tsc --noEmit`,
   `pnpm --filter mobile test`, `pnpm --filter mobile lint` — blocked by: none — PR:
