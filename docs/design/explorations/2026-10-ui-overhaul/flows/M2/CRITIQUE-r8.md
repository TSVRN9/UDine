# M2 critique, round 8 (before)

The crops are in `build/r8/before/` (`build/r8/shots.js`, dpr 2, real size). They show the round-7 build. The round-7 page is
saved as `build/r8/before/index.html`, which is what the RED runs use.

## Ratings panel (Golden BBQ Chicken Thigh), `sheet-panel.png`
1. **A 7 px bar ends nothing.** The panel carries the label's classes (`.facts.label`), so its last row picks up `.lr.last`.
   That draws the label's section-end bar just above the panel's own 2 px border. On the label that bar means "the
   nutrients end here". In the panel no section ends there.
2. **A 1 px rule cuts the carbon rating in two.** "Carbon rating A B C D E" and its own band line ("Medium: 3 to 4.25 kg
   CO₂e…") are split by a full rule, as if they were two items.
3. **The carbon scale's selected letter is a hall tag.** The selected letter is drawn as a deep-maroon square with a gold
   Oswald letter. That is exactly the treatment of a Search row's W F H B. A "B" here and Berkshire's B are the same object.

## Plant based and vegetarian, `hall.png` (Worcester, Tandoor) and `search.png`
4. **One leaf, filled or outlined.** Both marks sit in a 20 px gold patch with a dashed stitch 2 px in, so each leaf is drawn
   at 12 px. At that size the outlined leaf's 1.5 px stroke and its midrib fill most of the shape, and the stitch crowds
   it. "Chickpea Salad" (vegetarian) and "Cumin Basmati Rice" (plant based) are told apart only by squinting. The chips
   ("Vegetarian", "Plant based") rely on their words.
5. **The Low carbon chip's mark is an egg.** It is an outlined oval with no meaning, and no other screen uses it.

## Rows, `search.png` (and the same rows at 360 px)
6. **The meta line wraps item by item.** At 360 px, a Search row with four hall letters breaks between letters or between
   "protein" and the first letter, and the wrapped line starts 6 px in (the tags' own margin). Any new reading added to
   that line would make it worse.

## You, `you.png`
7. **There is no place for display preferences.** The list holds Favorites, Dietary preferences, Which was better? and
   Export: four pushes. Nothing on it changes what a row shows.
