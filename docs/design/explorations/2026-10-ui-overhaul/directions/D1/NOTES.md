# D1: Push the identity

Maroon owns the top of every screen. The one loud element is each hall's chenille varsity letter (W/F/H/B), the kind sewn onto a letterman jacket. Everything else is plain rows, sentence case, and tabular Oswald numerals.

## (a) Tokens

**Color**

| Name | Hex | Role |
|---|---|---|
| Deep maroon | `#3b0a0f` | Home header ground, menu tab strip, plate bar, display ink (station names, "Your plate", the nutrition label) |
| Varsity maroon | `#881c1c` | UMass's official maroon. Open-hall bands, menu header, primary action on light grounds, stepper glyphs, open status on cafés |
| Gold | `#c99a2e` | Only on maroon: letter fill, active-tab underline, the Log button in the plate bar. Never used for small text on `#881c1c` (3.7:1) |
| Chalk | `#f8f9fb` | Cool white for lists and the sheet. Replaces the cream |
| Ink | `#24171a` | Body text. A maroon-tinted near-black, 16.4:1 on chalk |
| Slate | `#6e6266` | Secondary text and units (5.5:1 on chalk, 5.0:1 on the search field `#eceef2`) |

Derived values: hairline = ink at 12%; stepper tint `#f3e4e4` (maroon glyphs at 7.6:1); text on maroon is white at 78–82% (6.2:1 or better). Scrim = `rgba(36,10,14,0.56)`.

**Type**
- **Oswald** (500/600/700) is used only for display and numerals: hall names, station names, "Lunch", "Your plate", the letters, and every number (cal, protein, quantity, totals) with `tabular-nums`. Always sentence case. No tracking.
- **Libre Franklin** (400–700) is used for everything else: status, dish names, units, tabs, buttons. Also sentence case.
- Scale (px): 13 meta and units, 15 status and tabs, 16 dish names and body, 20 sheet numerals and quantities, 22 station names, 26 bar totals, 32–34 hall names and "Your plate", 40 Calories, 52 meal name, 210 letter.

**Radii:** 0 for surfaces (hall bands, rows, headers), 8 for controls (steppers, buttons, field), 16 for the sheet's top corners, 2 for scrubber segments. Hierarchy shows in the radii; it's not one radius on everything.

**Spacing:** 20px side gutter. Rows are 64px minimum, hall bands 106px, the plate bar 66px of content plus 26px for the home indicator. All hit targets are 44px or more, including the scrubber's 24px-wide strip, which has a 44px hit area extending into the gutter. Gaps come from a 2px base: 4/6/8/12/16/20.

## (b) Self-review against the generic tells

| Tell | Status |
|---|---|
| Warm cream ground | Removed. The ground is `#f8f9fb` chalk, with maroon on top. |
| Tracked uppercase labels | None. Every string is sentence case, and no artboard uses `letter-spacing`. The old wordmark "UDINE" is now "UDine". |
| Monospace data labels | Replaced by Oswald tabular numerals plus a Libre unit in slate ("93 cal 13.3g protein" separates by spacing, not glyphs). |
| Middle-dot meta strings | None. Statuses are sentences ("Open until 9", "Closed, opens 4:30"). The plate bar stacks "3 items" over the totals instead of joining them. |
| SaaS card kit | Halls are full-bleed bands separated by 1px deep-maroon rules, with no radius and no shadow. Dishes and cafés are hairline rows. The only rounded containers are controls and the sheet. There are no shadows or gradients anywhere. |
| #111 for black | Ink is `#24171a` and display ink is `#3b0a0f`, both from the maroon family. |
| '→' on buttons | None. "Log", "Log 3 items". |
| Big number + small label + gradient hero | The plate totals are the one big number. They're set in Nutrition Facts panel grammar (2px box, heavy 7px rule under Calories, 1px rules between nutrient rows, label left and value right), the form students already read on food packaging and dining-hall signage. There's no gradient and no floating label. It's a ruled table, not a stat tile. |
| One-word accent in headlines | None. |
| 01/02/03 markers | None. The scrubber's segments carry information instead: each one's height is proportional to that station's dish count (4,3,4,3,3,2,2). |

**What I changed from the starting proposal, and why:**
- Tried the letter at 230px first. It cropped into unreadable vertical stripes. Then at 128–140px, where it read as a timid icon. Settled on 210px, anchored so the letter's top-left shows (felt edge visible) and it bleeds off the right and bottom. Large, cropped, and still clearly W/F/H/B.
- Closed status is encoded in the letter itself. Berkshire's band drops to deep maroon, and its B becomes an empty 2px outline with no gold and no felt. Open halls get the full gold chenille. That carries status without a pill or badge.
- Kept the stitch dashes (1.5px deep maroon, 5/4 dash) on the gold/felt boundary. Without them the letter looks like a sticker; with them it looks sewn. That's the UMass-specific detail.
- Removed the accessories: the profile avatar on Home, the pager dots, the chevrons on every row, the outlined "+" boxes on dish rows (now a bare 44px "+" target, so the tinted stepper is the only filled thing in a row), and the old "Search or scan a barcode" caption (a barcode glyph in the field says it).
- Considered a tone-on-tone W (deep maroon on varsity) in the menu header as the echo. Rejected it: at 2:1 it disappears, and it would break the shared-element motion below. The menu header uses the same gold chenille W at the same 210px crop.
- The menu uses rows with hairlines, not cards. Station names are Oswald 22 deep maroon, sticky. No gold divider bars.
- Gold for Log appears only on dark grounds. On the chalk sheet, "Log 3 items" is varsity maroon. A large gold slab on white read as mustard.
- Grab 'N Go: the brief gives one time, "about 7". All four bands, Berkshire included, show "Grab 'N Go until about 7" as its own 44px target, because Grab 'N Go hours are separate from the hall's dining hours. If Berkshire's Grab 'N Go actually follows the hall, that row should read "Closed, opens 4:30".
- No lunch end time is shown, because none was given. Harvest Market reads "Open now" for the same reason.
- Tabs keep 15px type. "Grab 'N Go" crops at the right edge, which reads as a scrollable row.

## (c) Motion and feel

**Signature motion: the letter carries you in.** Tapping a hall band makes its chenille letter a shared element. It moves from the band (y≈170–470 on Home) to the menu header's top-right at the same 210px size and crop, while the band's maroon expands to become the header. Letter translate is 420ms `cubic-bezier(0.22, 1, 0.36, 1)`. Header ground expands over 360ms with the same curve. The list fades up 12px over 240ms `cubic-bezier(0.2, 0, 0, 1)`, starting 120ms in. Back runs in reverse at 320ms `cubic-bezier(0.4, 0, 0.2, 1)`. This is the only choreographed moment. Everything else answers a touch.

**Plate sheet detents** (screen height 844):
- Collapsed: the plate bar, 92px including the home indicator.
- Medium: 564px tall (top edge at y=280). Shows the dishes, label, Log and search.
- Large: 790px (top edge at y=54) once the plate has more than 4 dishes or the search field is focused.
- Spring: `damping 26, stiffness 300, mass 1` (settles in about 380ms). Fallback timing is 340ms `cubic-bezier(0.32, 0.72, 0, 1)`. The scrim goes 0→0.56 alpha, tied to drag progress.

**Haptics**
- Adding a dish (+ or stepper +): light impact.
- Stepper reaching 0 (the row reverts to "+"): soft impact.
- Sheet snapping to a detent: selection tick.
- Scrubber crossing a station boundary: selection tick per segment.
- Log success: success notification. Log failure: error notification.
- Date stepper: selection tick.

**Press feedback**
- Rows and hall bands: background darkens 6% (bands get deep maroon at 18% over varsity), in 80ms `cubic-bezier(0.2, 0, 0, 1)` and out in 160ms. No scale on full-bleed bands.
- Buttons (Log, steppers, "+"): scale to 0.96 over 90ms `cubic-bezier(0.2, 0, 0, 1)`, spring back over 180ms `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- Stepper quantity: the numeral rolls vertically (old out, new in, 8px travel) over 180ms `cubic-bezier(0.22, 1, 0.36, 1)`. Plate bar totals use the same roll.
- Adding a dish while the plate bar is collapsed: the bar's cal numeral rolls and the bar lifts 2px for 140ms. No toast.
- Reduced motion: the shared-letter flight becomes a 200ms crossfade, numeral rolls become instant swaps, and detents snap without spring overshoot.
