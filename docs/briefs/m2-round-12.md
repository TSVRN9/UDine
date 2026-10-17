# M2 round 12: variant pickers

Goal: a dish that UMass lists as several near-identical items (the same drink in 16 and 20 oz, the same boba with
five milks) shows as one item with a picker, not a run of almost-duplicate rows. Picking a variant shows that
variant's own nutrition and logs exactly it.

Owner, 2026-10-14: "additional things can be combined into a picker: for example, sometimes drinks can be in two
different sizes (16 and 20oz) and there should be a picker. Items like the boba in the procrastination station can
also be combined, where they only differ by milk type which could just be a selector of which type of milk."

Roadmap: `docs/briefs/flutter-port.md`. Design only; no app code. Method as in rounds 9–11: critique, one concept in
`CONCEPT.md` "Round 12" (ASCII frames) before building, build in `src.html`, `test.js` `round12` (red first,
`RED=12`), vectors for the grouping rule, review passes in `NOTES.md`. The orchestrator frame-reviews before the
owner sees it.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`). The concept answers:
- **Which items group.** Derive the rule from the recorded feed (`flows/menus-2026-10-08-to-22.json`), not by hand.
  Seen there: size families ("12 oz Clam Chowder" / "16 oz …", "16 oz Cappuccino" / "20 oz …", "Coconut Mango Acai
  Bowl (8oz)" / "(16oz)") and option families ("Boba Almond Milk", "Boba Maple Milk", "Boba Oat Milk", "Boba Skim
  Milk", "Boba Soy Milk" at Procrastination Station). Group only within one place, meal and station, and only when
  the names differ by the variant token alone. List every family the rule finds and every near-miss it rejects in
  NOTES, so the rule can be checked.
- **The row.** One row per family: the family name (the shared part, e.g. "Cappuccino", "Boba"), what it shows for
  calories (the default variant's, or a range), and how `+` behaves (adds the default variant in one tap, as a row
  always does).
- **The picker.** In the dish sheet: a size picker (16 oz / 20 oz) and an option picker (Almond / Maple / Oat / Skim
  / Soy). The label, Contains, scores, price and "where" follow the picked variant. Use M2's existing controls and
  motion; a picker is a pick-one control, not a new screen.
- **Pick-one consistency.** The pho bowl's broth is already a pick-one (round 11b: picking a broth replaces the
  previous one, with no heading). Treat it with the same picker so pick-one reads the same everywhere; this also
  answers round 11's open "Broth heading" question.
- **On the plate and in history:** the item reads as the picked variant ("Boba, Oat Milk"; "Cappuccino, 20 oz"),
  its stepper and Update reopen the sheet on that variant, and the log records the actual feed item, so nutrition
  is exact and RN-shaped (`umass-menu` source with the variant's own dish name).
- **Search, favourites, alerts:** a family matches once in Search; decide what favouriting a family means
  (the family, or one variant) and how alerts match it.
- **Tracking off:** the picker still works for reading the label.

Annotations: none.
States: per concept, each with a `test.js` scenario (at least: a size family, the boba family, the pho broth picker,
a family on the plate, a family in Search, a near-miss left ungrouped).
Routes: `m2.html` with round-12 flags as needed.

Backend: none. Residency: none (log rows keep today's shape).
Rationale: the owner's request above. Rejected: grouping by fuzzy name similarity across stations (it would merge
different dishes); a separate variants screen (a pick-one belongs in the sheet).

## Acceptance

- [ ] The grouping rule, its families and near-misses are in NOTES; vectors cover it — evidence: vectors.json
- [ ] One concept in `CONCEPT.md` round 12, before the build — evidence: diff
- [ ] Built; `test.js` `round12` passes, each scenario shown red first; the full suite stays green — evidence: test
- [ ] Orchestrator frame review at 360 and 390; owner approves — evidence: owner
- [ ] The Flutter briefs that build it (dish sheet, plate, bowls, search) are updated — evidence: diff

## Tasks

1. Round 12 design and build in M2 — files: `docs/design/explorations/2026-10-ui-overhaul/flows/M2/` — lanes: M2
   `test.js` (Playwright: heavy, never alongside Gradle or an emulator) — blocked by: none — PR:
2. Fold it into the Flutter briefs — files: `docs/briefs/flutter-port-dish-and-plate.md`, `-bowls.md`, `-search.md` —
   blocked by: 1, owner approval — PR:
