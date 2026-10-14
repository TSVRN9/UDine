# M2 critique, round 10 (before)

Round 10 adds five things: the bowl builder, first-run onboarding, tracking off, past logs, and Health Connect / Apple
Health. This file covers what they collide with: today's shipped composer, and M2 as of round 9c. Line references are to
M2's `src.html` at 9c.

## Today's bowl builder (`mobile/src/components/CompositeDishComposer.tsx`)

1. **It has no data.** Which dishes are composite, and what their add-ins are, exists only as a dev fixture:
   - the fixture is `COMPOSITE_FIXTURE_ADD_INS` in `app/halls/[slug].tsx`, holding one invented "Teriyaki Noodle Bowl" and
     four invented add-ins;
   - `compositeDishFor` returns null unless `__DEV__`.

   So no production user has ever seen the composer. The fixture's own comment says no source links a base dish to its
   add-ins.
2. **The feed has the structure, by station.** No field links dishes, but stations group them. Over Oct 8–22:
   - **Hall build stations.** Their dishes are one build's parts:
     - Noodle Bowl, at W, H and B, 82 times. For example, "Beef Brisket Noodle Bowl" (218 cal) sits beside Bean Sprouts
       (2), Chopped Cilantro (1), Hard Boiled Egg (111), Scallions (5) and Steamed Bok Choy (11). The benchmark's brisket
       bowl is one of these.
     - Omelet, at W, 14 times. "Omelet Bar" (91 cal) sits beside cheese, tomatoes, peppers, onions and mushrooms.
     - Pasta Bar, at F, H and B, 84 times: pastas and sauces.
     - Deli Bar, at F and B, 28 times: meats, cheeses and spreads.
     - Salad Bar/Dressings, at B, 14 times, with 27–29 items.
   - **Café add-on stations.** 13 cafés have an "Add-ons" or "Toppings" station beside their dishes at the same meal:
     - Tamales has Bowls and Burritos, plus Toppings (rice, beans, salsas, guacamole).
     - Green Fields has its salads, including "Create Your Own Salad", plus Add-ons (avocado $2.50, grilled chicken
       $4.25, and so on).
     - Wasabi has its dons, plus Add-ons.
     - Add-ons usually carry a price (Green Fields, Wasabi); Tamales' Toppings don't. Some aren't toppings at all:
       Fountain Drink (no nutrition), Hand Fruit and Kettle Chips.
   - Stir Fry Station has a single condiments dish, so there is nothing to build there.
3. **It's a second, different sheet.** It has its own `Modal`, its own gesture root and its own drag distance. It doesn't
   show the base dish's label, marks, allergens, "where" or price. Opening a bowl is a different object from opening a
   dish.
4. **It brings back what the owner dropped or M2 removed:**
   - the hold-and-slide quantity (dropped by the owner; M2 uses the stepper only);
   - tracked uppercase labels ("ADD-INS", "ADD TO PLATE", "FULL NUTRITION LABEL ›");
   - monospace meta joined by middle dots ("base · 260 cal · 10g protein");
   - an expandable row per add-in that holds a nested label link.
5. **The recipe is lost when it's folded.** `foldRecipeToPlateEntry` merges the base and its add-ins into one entry with
   the base's name and key:
   - the log can't say what was in the bowl;
   - two different bowls of the same base can't both be on the plate, because the second replaces the first;
   - %DV is dropped;
   - only the base's price is kept, so a $4.25 grilled-chicken add-on vanishes from the price.
6. **The recipe lives only in memory.** It's session state, never persisted, so "Edit add-ins" works only until the app
   restarts.
7. **The range is misleading.** The row's preview, "260–440 cal", takes as its top one of every add-in. At a 29-item salad
   bar that's a number nobody eats.

## M2: the bowl builder

8. **The dish sheet's resting height** is measured to end on the Calories rule (`dishMid`). A list of 5–29 add-ins between
   the identity group and the label pushes Add and Calories off screen at rest. Add moves too, as add-ins change.
9. **A plate item is one dish** (`{k, n, refs, qty}`). `findItem` looks items up by `k`, and a row's stepper shows that
   item. A bowl and a plain serving of the same base dish (the benchmark adds the plain brisket bowl with one tap) would
   share a `k`, so the row's stepper couldn't tell them apart.
10. **Totals read one dish's macros** per item (`macroOf`), and the Full label sums `nut` arrays. A bowl needs both summed
    from its components.

## M2: tracking off

11. **The ledger is woven through every surface.** Each of these would have to go:
    - the row control lane (`ctl`, with the `wouldSplit` ghost +);
    - Search's 114 px lane, which holds + over the hall letters and sets the row's height;
    - the sheet's "Add to plate" / "Add another";
    - the plate bar and its gestures, the plate sheet, and the Log receipt;
    - "Add “x” as a custom food" in Search and on a menu-less café;
    - `syncFront`;
    - You's Today block: the facts, Meals and the day total.
12. **"Which was better?" and Export are built from the log** (`rankPool`, `exportData`). With tracking off they have
    nothing new to work from, but they may have history. Export is the release valve for device-only data
    (CLAUDE.md, "Data export: not optional").
13. **The sheet's rhythm assumes an action.** The spacing is identity → 16 → Add → 24 → where. Without Add, there's a
    hole, or "where" moves up.

## M2: past logs

14. **The log isn't by day.** `S.log` is a flat list, and `dayTotal()` sums all of it, so You's "Today" would include
    every past day once history exists.
15. **Logged items are flattened** to `{n, qty, cal, p, c, f}`, with no dish id, no place and no full nutrients. So:
    - a past meal can't show its label;
    - it can't recompute its totals from a dish;
    - it can't give Health more than four numbers.
16. **You has no way into the past.** Today's meals are a static list (`.meal`), and nothing opens.
17. **There is no Undo outside the plate bar.** The receipt snackbar lives in the bar's slot, and the bar only exists
    while a plate does.

## M2: onboarding

18. **There is no first run.** `udine-m2` is read if it's there, and defaults apply silently. Nothing marks a first launch.
19. **The decisions are scattered.** Dietary preferences is a pushed page, "Show on dishes" is a section on You, and
    Campus is another. Tracking doesn't exist as a setting. Onboarding has nothing coherent to show, and You has no
    section for "how UDine works for me".
20. **The hall door.** Any screen before Halls costs a hungry student taps. A three-page carousel costs at least three.

## M2: Health

21. **There's no notion of the platform** (iOS or Android): the name, the OS permission sheet, and "Open settings".
22. **A logged meal has no stable record** that a Health write could be updated through, after an edit or a delete.
23. **Permission can be revoked outside the app.** A toggle stored as on could be lying. Its true state is "on and allowed".

## Seeded history

24. **The fixture's days are Oct 8–22**, and the feed serves no past days. A week of past logs (Oct 1–7) can only be
    built from dishes that exist in the fixture. Those are real dishes with real nutrition, but the days and meals are
    seeded. Today's 8:42 AM Worcester breakfast is already seeded (round 1).
