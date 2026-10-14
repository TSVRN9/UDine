# Flutter port: packaged foods and Your foods

Goal: in the Flutter app, a user can find a packaged food (OpenFoodFacts, USDA) or a UMass Dining dish that isn't
on a menu this week, add it to the plate, and find it again later under Your foods. That includes custom foods
they typed in. Everything they've saved stays on the phone and is exported.

Roadmap and global decisions: `docs/briefs/flutter-port.md`. Design approved by the owner on 2026-10-14 (#562).

## Spec

UI: M2 R11 §1 (`CONCEPT.md` "Round 11", section 1), plus NOTES "Round 11" and "Round 11b" as built.
- **Search continues past the menus.** After Places, Lunch now, At cafés and Later, these follow, in order:
  - **Your foods** (custom foods, plus packaged and lookup foods you've added);
  - **Packaged** (OpenFoodFacts, then USDA);
  - the text button "Search UMass Dining for “x”";
  - the custom-food button.

  These rows show only `+` in the lane, never a place. Per-100 g foods read "368 cal per 100 g", on the plate too.
- **Lookup states** take the button's slot:
  - in flight: the activity indicator after 400 ms;
  - found: a "UMass Dining" group;
  - none: "UMass Dining has nothing else called “x”.";
  - failed: "Couldn't reach UMass Dining." with Try again;
  - rate-limited: "Searching UMass Dining is paused until 1 PM.". The budget is global and resets on the UTC
    hour, so the time shown is true.
- **A packaged food's sheet:** name and serving, Contains, Add to plate, the label and ingredients. No "where",
  grades, ratings or star.
- **A saved food's sheet** has Edit where a dish has its star. Edit turns the sheet into the form, with Save and
  Delete. Delete shows a "Deleted <name>" receipt with Undo.
- **You → Your foods** lists every saved food.
- **Owner's answer:** packaged and lookup foods are saved to Your foods when added (owner, 2026-10-14).
- **Tracking off** hides all of it.
- **Offline:** Packaged is absent, and Your foods still answers (M2 R11 §4).

Annotations: none.
States:
- Search "clif" (Your foods + Packaged), "chobani" (one saved food), "laksa" (each lookup state);
- the packaged sheet;
- the saved sheet, Edit, and Deleted with Undo;
- You → Your foods;
- tracking off;
- offline;
- Packaged failed (Try again).

Routes: `/search?q=…` in recorded mode, with recorded Packaged and lookup answers (flows/packaged-2026-10-13.json;
lookup "found" answers from recorded dishes later in the 15 days, as M2 does).

Backend: `lookup-dish` edge function (existing, anonymous, rate-limited; called over Supabase REST with the
publishable key), OpenFoodFacts and USDA FDC (the same endpoints and fields as `shared/src/openFoodFacts.ts` and
`usdaFoodData.ts`; USDA's key as `--dart-define`, `DEMO_KEY` fallback as in TS).
Residency:
- **Saved foods: Device only.** Custom foods stay in RN's `custom_foods` table, in RN's shape.
- **Packaged and lookup foods** are saved in a new device table `saved_foods(id TEXT PK, food_json TEXT)` (a
  `user_version` migration; additive), exported as JSON and CSV like every table.

The searches send only the query text, as RN does today.
Rationale:
- **Same sources as RN.** The OFF/USDA mapping is checked against the TS mapping with new shared vectors
  (`shared/vectors/packaged.json`: raw OFF/USDA responses in, mapped `LogEntry` source and nutrition out), so a
  packaged food logs the same in both apps.
- **Separate table for non-custom saved foods.** `custom_foods` keeps RN's exact shape (the device-data carry-over
  depends on it).

## Acceptance

- [ ] OFF and USDA mapping match TS on `shared/vectors/packaged.json` — evidence: test (shared + flutter lanes)
- [ ] Each lookup state renders as M2 shows, including the rate-limit time from the server's reset — evidence:
  test + goldens
- [ ] Adding a packaged or lookup food saves it to Your foods; Edit/Delete/Undo restore exactly; custom foods
  stay in RN's `custom_foods` rows — evidence: test
- [ ] `saved_foods` is exported (JSON, CSV) — evidence: test
- [ ] Goldens at 360/390 for every state above, M2 DOM measurements within 1 dp, device screenshots
  (photos off) — evidence: test + screenshot

## Tasks

1. **Clients and vectors:** Dart OFF/USDA clients and mapping, `lookup-dish` client, and
   `shared/vectors/packaged.json` (generated from TS) — files: `shared/scripts/`, `shared/vectors/`,
   `app/lib/data/` — lanes: shared, flutter — blocked by: none — PR:
2. **Store:** the `saved_foods` table, Your foods in `UdineStore`, export — files: `app/lib/core/store/` —
   lanes: flutter — blocked by: 1 — PR:
3. **UI:** Search groups, lookup states, packaged and saved sheets, Edit/Delete/Undo, You → Your foods — files:
   `app/lib/screens/search/`, `app/lib/screens/you/` — lanes: flutter — blocked by: 2, search 1,
   dish-and-plate 1 — PR:
