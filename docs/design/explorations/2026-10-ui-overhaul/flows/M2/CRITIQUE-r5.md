# M2 round 4, read as a student would use it

I opened round 4 at four real moments. The owner's three notes (gaps, short strips, unhelpful food finder) are symptoms of one problem: the screens were assembled from parts that each answer a different question in a different material.

## 12:40, walking to lunch (Halls)

**What holds.**
- The maroon header says "Lunch" and the date. Under it are four full-bleed hall photos, each in maroon duotone with its chenille letter, its hours and five busy lamps.
- That's the identity at its best: one construction repeated four times, at one scale, with 1 px of deep maroon between bands.

**Where it comes apart, with 2 pins.**
- **Seams.** Below Berkshire the stack switches to a different object. The seam above it is a 1 px *chalk* line, not maroon. The same chalk line sits between the header and Worcester. It's the owner's "strange gap".
  - Measured at 360–430 px wide and DPR 2 and 3, it's the same every time.
  - It shows "sometimes" because the mid-screen seam only exists once something is pinned.
  - Cause: the first card's `margin-top:1px` collapses out of `#bands` and `#pins`, so the chalk of `#halls` shows through.
- **Café strips.** They are 56 px, half a band, which is too short for the photo to read as a place: Wasabi is a purple smear.
  - Their grade is a neutral grey-brown, not the halls' maroon, so they look like they came from another app.
  - Their type (Oswald 20 / 13) has no ratio to the band's (32 / 15).
- **Area list.** Then a third rhythm starts: a chalk list of four area rows ("12 of 12 open now").
- **Overall.** The page has three scales (112, 56, a list), two photo materials and two seam colours, and nothing ties them together.

## Looking for a specific dish (Search, "posole")

**The row.** It carries W F H B as four boxes, empty ones outlined. That's a four-cell grid on every row, and the empties answer "where *not*", which nobody asks.

**The detail.** It adds a Today / Tomorrow switch and a halls × meals grid:
- maroon cells mean served, gold means now, pale means earlier;
- a blank coloured cell is the button that opens the hall.

The grid answers "show me this dish's whole schedule for two days". A student asks one thing: *can I get it now, where, and if not, when next?* To get that, you scan sixteen cells and decode three fills. The switch hides the answer when it's tomorrow. Gold means "now" only because the busy lamp board says so. The grid is the "afterthought meant to check boxes" in its purest form: a generic widget in maroon.

**Search rows don't say when.** "Later today and tomorrow" rows say "Dinner" and repeat the four boxes. They never say a time.

## Between meals (3:45 PM) and late at night (11:50 PM)

The app has no clock in its answers:
- the grid's "now" is `meal === 'lunch'`, not a comparison with the time;
- the hall bands give the hall's opening hours, not the meal's;
- at 3:45 the grid would still paint lunch gold at Franklin, whose lunch is over;
- at 11:50 the useful answer is "tomorrow, breakfast at 7 AM at Worcester", and no screen can say it.

The header leads with "Lunch", so time is already the app's first axis. Every answer about *where* should be said in the header's terms: a meal and a clock time.

## Search's idle state (event cards)

The felt-and-stitch banner cards hold, on the maroon band, in the identity's own materials. But at the end of the carousel the last card sits 40 px from the right edge against a 20 px left gutter, because the padding, the 12 px gap and an 8 px spacer all add up. That's the second gap.

## Dish detail, apart from the grid

The detail holds:
- the Nutrition Facts panel and the graded second panel use the label's rule system;
- the felt mark patches match the chenille letters;
- it grows out of the row and returns to it.

Only the where-and-when block is foreign.

## What to keep, what to cut

**Keep:**
- the band construction;
- the chenille letters, as the halls' names in short;
- the felt patches;
- the label panels;
- the container transform from any card;
- "Lunch" as the page's first word.

**Cut:**
- the grid and its switch;
- the outlined empty letters;
- the café strips' foreign grade and half-scale height;
- both chalk seams;
- the carousel's double end gutter.
