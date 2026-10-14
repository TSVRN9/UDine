# M2 critique, round 12 (before)

Round 12 groups items UMass lists several times over (one drink in two sizes, one boba with five milks) into one item
with a picker. The brief is `docs/briefs/m2-round-12.md`. References are to RN on `main` (099a0646) and to M2's
`src.html` as of round 11b.

## What a student sees today

1. **A run of near-duplicates.** Worcester Café's Beverages lists 18 hot drinks as nine pairs: "16 oz Cappuccino",
   "20 oz Cappuccino", "16 oz Caramel Macchiato", "20 oz Caramel Macchiato", and so on. Sorted by name, the pairs
   aren't even adjacent: every 16 oz drink comes first, then every 20 oz. The 20 oz latte is the 24th row, after
   nine rows that differ from their twins by one number.
2. **The size leads the name.** "16 oz" is the first thing on the row, ahead of what the drink is. At Harvest Market,
   Roots and Whitmore the soups read "12 oz Clam Chowder" and "8 oz Clam Chowder", so the eye scans a column of sizes.
3. **Five boba rows that differ by one word.** Procrastination Station's whole menu is "Boba Almond Milk", "Boba Maple
   Milk", "Boba Oat Milk", "Boba Skim Milk", "Boba Soy Milk". The choice is the milk; the list makes it look like five
   drinks.
4. **Search repeats them.** "boba" gives five rows in "At cafés", each with the same three-café lane. "cappuccino"
   gives two.
5. **Comparing sizes means two sheets.** To see what the 20 oz adds over the 16 oz you open one, close it, and open the
   other. Nothing on the row says they're the same drink.
6. **Favouriting is per name.** Starring "16 oz Cappuccino" doesn't star the 20 oz, and an alert for one fires while
   the other is just as available.
7. **RN does nothing here.** It shows each feed item as its own row (`halls/[slug].tsx`), so RN and M2 agree today, and
   the change is new in both.

## The pick-one M2 already has

8. **The pho's broth is a pick-one drawn as add-in rows** (round 11b). A broth's `+` picks it and puts back the last
   one. That control means "add some of this" everywhere else in the builder, so the pick-one only shows itself after
   you press it. Round 11 left "Broth heading" open for this reason: nothing says the broths are a choice of one.
9. **Café pho builders are the same** (Whitmore, Star Ginger). Their choices are whole phos ("Beef Pho w/Vegetable
   Broth") listed as rows with `+`, mixed with the café's add-ons under a second heading.

## The data

10. **Most families open as builders.** Every family is at a café. Worcester Café, Roots (lunch and dinner),
    Courtside, Newman and Whitmore all have an Add-ons or Toppings station, so under round 10's café rule each
    family member already opens the bowl builder with that station's add-ons. A picker that only worked in the plain
    dish sheet would miss most of them.
11. **Blank calories read as 0.** "20 oz Chai" has no calories in the feed; `build.py` stores 0 (`or 0`), so it draws
    "0 cal" next to the 16 oz's 211. A picker puts the two numbers side by side. This predates round 12.
12. **A size in a name isn't always the serving.** Harvest Market's hot bar lists "Yellow Cheddar Macaroni & Cheese (8 oz)"
    alone, so it is no family, but its record is a 4 oz serving (185 cal) on most days and an 8 oz one (370 cal) on
    Oct 18. A picker labelled by the name's token trusts the name; the serving line under it is the record's.
