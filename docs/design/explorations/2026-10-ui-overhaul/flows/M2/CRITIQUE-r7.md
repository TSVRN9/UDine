# M2 critique, round 7 (before)

The screenshots are in `build/r7/before/` (`rv.js` plus `build/r7/extra.js`). They show the round-6 build at rest. Gaps are measured in the DOM, not judged by eye.

## Dish detail (Golden BBQ Chicken Thigh, from Search), `dish-top.png` and `dish-mid.png`
1. **A 76 px maroon bar holds only a back arrow.** It frames the dish as a destination page, but the dish is something looked at over the list. It costs a sixth of the screen.
2. **"Where" sits directly on the label.** The Worcester chip ends at y 406 and the Nutrition Facts box starts at 406, with no gap.
3. **There is no spacing scale.** The gaps, top to bottom:
   - name to serving: 6;
   - serving to badges: 12;
   - badges to Contains: 14;
   - Contains to Add: 16;
   - Add to "Lunch now": 18;
   - "Lunch now" to its chips: 8;
   - chips to label: 0;
   - label to grades: 0;
   - grades to Ingredients: 22;
   - Ingredients to Show all: 0 (a 44 px box);
   - Show all to favorites: 12.

   Related things aren't closer together than unrelated ones.
4. **Favorites is foreign to the screen.** "☆ Add to favorites" uses a text-glyph star in a full-width outlined button at the very end, 1,230 px down. You only find it after the ingredients, and it matches no other control. The page's pin, for comparison, is a drawn icon in the bar that fills gold when on.
5. **Contains borrows the label's rule weights** (4 px over 1 px). It reads as a torn-off strip of the label floating above the button.
6. **Ingredients are cut by character count.** "Show all" appears only when the list exceeds 180 characters, but three lines at 350 px hold about 150. A 150–180 character list is clipped with no way to read the rest. "Show all" also floats in a 44 px box under the fade.
7. **Model.** It is a page that grows out of the row. The owner's decision makes it a sheet over the list.

## Café page (Wasabi), `pin-open.png`, `place.png`, `place-scrolled.png`, next to `hall.png` and `hall-collapsed.png`
1. **It is built differently from a hall.**
   - A hall is a 306 px photo header with the name in white over a maroon gradient, then status. On scroll it collapses into the maroon bar with the name.
   - The café is a flat vm bar with the title, then an ungraded photo boxed under it, then status in maroon Oswald on chalk.
   - The two read as different apps.
2. **Status and hours sit on chalk under the photo**, where the hall says them on the photo.
3. **Scrolled**, the photo slides under a static bar. Nothing collapses, and the name never moves.
4. **Location and payment are two unlabelled slate lines.** They are acceptable, but they run straight into the description with only 4 px between.

## Pinned cafés next to halls, `pins.png`
1. **Wasabi and Tamales are full colour under a near-black gradient.** Beside the four duotone maroon bands they look like grey photos from another product. The halls' grade is a grayscale duotone (multiply #c4434b, screen dm) plus the dm left gradient. The cafés use only a gradient.
2. **Scale and text are right** (84 px, Oswald 24, 14 px status, no letter). Keep them.

## Cafés & markets list, `cafes.png`
1. **The thumbnails are ungraded photos** (64×34, radius 5). That matches the café page at rest, which is ungraded like a hall page. Keep them.
2. **The 130 px status column forces names and buildings to wrap.** "Peet's Coffee & Tea / Integrated Learning Center" takes four lines, so row heights run from 56 to 90 px. It's acceptable for a browse list, so it's left alone.

## Event page (Indigenous Peoples Day), `event.png`
1. **The dm bar, dm band and `--ext` stretch existed to make the card's ground grow.** Under push they are only a header. They still read as one surface, and the felt frame needs maroon around it, so the band stays.
2. **The buttons sit 12 px under the band's edge**, tighter than the 20 px side inset.
3. **Long titles in the bar aren't ellipsised.** "Sustainability is on the menu" is the risk.

## Transitions (r6 strips, `compare-*.png`)
1. **Event, café row, area row, You row, Search place and Search hall all grow out of their row.** The owner now wants push for all of them: only hall bands and pins expand.
2. **The page drag-down maps 480 px to the whole close.** The window doesn't track the finger, and on pushes there should be no drag-down at all.
3. **Dish detail is a page grown from the row.** It becomes a sheet.
4. **Hall tag → another hall is a fade-through swap.** Under push it becomes a navigation with a real back.
