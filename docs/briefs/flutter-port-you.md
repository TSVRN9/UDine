# Flutter port: You, past logs, first run and tracking off

Goal: the Flutter app's You tab shows today's totals and every earlier day, carried over from RN. From
there a user can open, edit and delete any past meal with Undo, and set what the app does: tracking on or
off, dietary preferences, scores on dishes, the Charles River Campus, favourites, "Which was better?" and
export. A new user gets M2's first-run sheet once.

Roadmap and global decisions: `docs/briefs/flutter-port.md`.

## Spec

UI (M2, `docs/design/explorations/2026-10-ui-overhaul/flows/M2/`; `renderYou` around 1687, `pageContent`
around 1795):
- **You:**
  - **Today:** the totals box and Meals;
  - **Earlier:** day rows, newest first;
  - **Track what I eat,** then the Health row (the row itself is `flutter-port-health`; this brief leaves
    its slot);
  - **Favorites;**
  - **Dietary preferences:** "Only show" (Vegetarian, Plant based, Halal) and "Avoid" (the 11 allergens;
    CONCEPT R9 §3);
  - **"Which was better?";**
  - **Export my data** (JSON, CSV);
  - **Campus:** the Charles River toggle (NOTES "Round 9b");
  - **Show on dishes:** the score toggles (NOTES "Round 8").
- **Past logs** (CONCEPT R10 §3; `openMeal`, `renderMeal` around 1706):
  - the day page (push);
  - a meal in the item sheet, with steppers, Full label and Delete meal;
  - the inline "Removed… Undo" row;
  - the "Deleted <hall> lunch" receipt with Undo.
- **First run** (CONCEPT R10 §1):
  - a non-modal sheet resting under the four bands, holding You's own rows;
  - shown once;
  - a band tap opens the hall;
  - skipping it means tracking on, no filters and scores off (owner, round 10).
- **Tracking off** (CONCEPT R10 §2; `setTrack` around 1147):
  - no `+`, plate or custom food anywhere;
  - "where" takes the dish sheet's action slot;
  - You keeps its title;
  - "Which was better?" is hidden; Export stays while any history exists (owner, round 10);
  - turning it back on restores the plate and history as they were.
- **"Which was better?"** is M2's page as designed (owner, 2026-10-13): pairs drawn from the dishes in
  the user's own log, then "Your ranking". No daily allowance, skip, or post-log prompt.
- **Newer database** (user installed an older build): You shows "Your history was saved by a newer version of UDine. Update UDine to see it and keep logging." and tracking stays off; nothing is written (`Boot.menusOnly`, `app/lib/boot.dart`).

Annotations: none.
States:
- You with no history, with today only, and with today and earlier days (seeded from the device-data
  upgrade);
- a day page;
- the item sheet with steppers;
- "Removed… Undo";
- the "Deleted" receipt;
- Dietary preferences with several Avoids;
- "Which was better?" with a pair, with the ranking, and with too little history;
- Export;
- first run over Halls, then after it's dismissed;
- tracking off across Halls, the hall menu, the dish sheet, Search and You;
- the Charles River toggle on.

Routes: `/you`, `/you/day/<date>`, `/you/diet`, `/you/rank`, `/you/export`, `/halls?firstRun=1`, and
`?track=off` on any route. Record a past meal edit with Undo, Delete meal with Undo, and first-run
dismissal with `--record`.

Backend: none.
Residency:
- "Consumption log, macro history, daily totals: Device only";
- "Dish ranking: Device only, always";
- Data export: every device-local table, both formats.

Nothing here leaves the device except an export the user starts.
Rationale:
- **History is RN's history.** Days and meals come from the carried-over `log_entries`, grouped by local
  day and meal window (`core/` hours). An RN-logged meal and a Flutter-logged one look the same.
- **Rankings carry over.** RN's `ranked_dishes` and `ranked_foods` (Elo, `core/ranking.dart`) seed the
  "Your ranking" order. New picks update the same rows, so nothing a user ranked in RN is lost. M2's
  prototype counts wins. The real app keeps Elo, because that's what the stored rows mean.
- **Export is the real exporter, not M2's mock.** M2's `exportData` writes a sample with the log only.
  The app exports every device-local table in the TS exporters' formats (`core/export.dart`, vectors), and
  shares the file through the OS share sheet (`share_plus`, the one new package here).
- **Tracking off is a preference, not a mode switch per screen.** One `track` value in `preferences_kv`
  that every screen reads. The hall-menu, dish-sheet, plate and Search code gains the off branch here,
  with tests in each.
- **Dietary preferences map onto RN's `food_preferences`.** M2's Only show and Avoid are written into the
  existing row's fields, so RN users keep the allergens they set. A field M2 drops stays untouched.
  Only show and Avoid write the UMass feed's exact strings (e.g. diet tag "Plant Based" with a capital B,
  allergens as the feed spells them; M2's src.html takes them from the feed via `__ALG__`), never M2's
  display labels, so RN users' saved values show as checked and filters match.

## Acceptance

- [ ] Goldens at 360 and 390 for every state above, and M2 DOM measurements for You's rows, the totals box,
  the day page, the item sheet and the first-run sheet within 1 dp — evidence: test
- [ ] Device screenshots of each state next to M2's own render. The "earlier days" state uses the A53
  after the device-data upgrade, so it shows real RN-logged days — evidence: screenshot
- [ ] Editing servings, removing an item and deleting a meal each change the store, and each Undo puts
  back exactly what was there — evidence: test
- [ ] With tracking off, no screen offers `+`, the plate or custom food. Turning it back on restores the
  plate as it was — evidence: test, for each screen
- [ ] An RN user's `food_preferences` allergens appear checked under Avoid. RN's `ranked_dishes` order is
  "Your ranking" before any new pick — evidence: test, plus the A53 upgrade run
- [ ] The first run shows once, survives an app kill before dismissal, and a skip gives tracking on, no
  filters and scores off — evidence: test
- [ ] Export writes every device-local table in JSON and CSV, matching the TS exporter vectors, and opens
  the share sheet — evidence: test + a device screenshot of the share sheet

## Tasks

1. **You and past logs** — the You tab, the day page, the item sheet, edit/remove/delete with Undo and
   receipts — files: `app/lib/screens/you/` — lanes: flutter — blocked by: device-data 2,
   dish-and-plate 2 — PR:
2. **Settings pages** — Dietary preferences, the Charles River toggle, score toggles, Favorites,
   "Which was better?", Export — files: `app/lib/screens/you/` — lanes: flutter — blocked by: 1 — PR:
3. **First run and tracking off** — the first-run sheet over Halls, and the tracking-off branch in every
   screen — files: `app/lib/screens/halls/first_run.dart`, the screens' off branches — lanes: flutter —
   blocked by: 2, search 1 — PR:
