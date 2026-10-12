# D3: Native-first restraint

Platform conventions first: iOS 26 grouped lists, glass circle buttons, a capsule material bar and a floating partial sheet. The brand shows up in one place, the open-hall tiles on Home. Everywhere else, maroon is only the tint color for interactive elements.

## (a) Token plan

**Color**
| Name | Hex | Role |
|---|---|---|
| groupedBackground | `#f2f2f7` | screen ground, sheet ground |
| cell | `#ffffff` | inset-grouped cells, glass buttons |
| label | `#000000` | primary text (true black, as iOS uses, not #111) |
| secondaryLabel (AA) | `#6c6c70` | subtitles, macro lines, trailing status. iOS's own `rgba(60,60,67,.6)` comes out around #8a8a8e, about 3.4:1 on white, which fails AA. #6c6c70 gives 5.1:1 on white and 4.6:1 on #f2f2f7 |
| tint | `#881c1c` | UMass maroon: add buttons, step counts, date chevrons, Log, open-hall tiles |

Supporting neutrals, all system values: separator `#c6c6c8`; segmented track `#e3e3e8`; stepper fill `#eeeef0`; tint-tinted add circle `#f1e4e4`; chevron `#9c9ca1`; inactive index and the closed hall letter `#8e8e93` (3.3:1, which passes for 40pt bold). Open status on the maroon tiles is `#f2dede` (7.3:1). I dropped the iOS accessible green `#248a3d` because it measures 4.4:1 on white and fails AA at 15pt; open and closed is carried by the tile fill instead.

**Type.** One family, the system font: `-apple-system, "SF Pro Text", "SF Pro Display"`, then Inter as a Google-Fonts stand-in so the Linux render has SF-like metrics (on iOS, SF always wins). The scale follows Apple's Dynamic Type "Large" defaults:
- Large title 34/41 bold, -0.9 tracking
- Title 3 20/25: semibold for hall names, bold for section headers
- Headline 17/22 semibold: nav title, plate bar, buttons
- Body 17/22 regular, -0.41 tracking (SF's own 17pt tracking): dish names, rows
- Subheadline 15/20 regular: macro lines, status, the date eyebrow (semibold)
- Footnote 13/18: sheet subtitle, segment labels (500, 600 when selected)

Nothing is uppercase and nothing is tracked out. Section headers use `.headerProminence(.increased)` sizing, in sentence case.

**Radii** (concentric, as iOS 26 does it): sheet 40 (8px inset from a ~48pt display corner); inset groups and tiles 26; capsules are height ÷ 2 (plate bar 32, buttons 22–26); icon square 9; index segments 1.5.

**Spacing:** 16 screen margin, but 24 on the menu's trailing edge so the station index owns the gutter. Cell inset 16. Rows are 64 for two lines and 52–56 for one. 20–24 above section headers, 12 grid gap. Every control is 44×44 or larger: the segmented control is drawn 44 high, and the stepper is a 96×44 capsule of two 48×44 halves, with the count centered over the seam.

**Numbers.** Golden BBQ Chicken Thigh: 93 cal, 13.3 P / 2 C / 3.6 F. Beef Brisket Noodle Bowl: 218 cal, 12.3 P / 26 C / 7.0 F. Plate total (×2 + ×1): 404 cal, 38.9 g protein, 30 g carbs, 14.2 g fat. Check: 4·38.9 + 4·30 + 9·14.2 = 403.4.

**Date.** 2026-10-08 is a **Thursday**, not the Wednesday the brief's hours assume. Home prints "Thursday, October 8" and uses the brief's hours unchanged. D1 and D2 should agree on this.

## (b) Self-review against the generic tells

- **Warm cream ground:** not used. The ground is `systemGroupedBackground`.
- **Tracked uppercase labels:** none. iOS dropped uppercase grouped headers, and sentence-case prominent headers match current Settings and Health.
- **Monospace data labels:** none. Macro lines are the system font: "93 cal, 13.3 g protein".
- **Middle-dot meta strings:** none. Meta uses commas ("3 items, 404 cal", "Worcester lunch, today"), or the value sits in its own trailing column.
- **SaaS card kit:** avoided. One white inset group per section, with hairline separators and no shadows. Shadows appear only on floating chrome (glass buttons, plate bar, sheet), where they mean "this floats". Home's 2×2 tiles follow the Reminders/Shortcuts smart-list grid, which is a platform pattern. The tiles also differ from each other by state: three filled, one plain.
- **#111 for black:** not used. Label is `#000000`.
- **"→" on buttons:** none. Disclosure uses the system chevron, on navigating rows only.
- **Hero stat:** avoided. Plate totals are Health-style label-left/value-right rows in a 2×2 cell, 15pt, with no big number and no gradient. I rejected a four-tile big-number totals strip.
- **One-word headline accent:** none. "Lunch" is the whole large title.
- **01/02/03 markers:** none. The hall letters are identifiers, not a sequence.

What I changed while working:
1. Home tiles started as white tiles with maroon letter circles. That read as a contacts avatar and didn't separate open from closed at a glance. Now the three open halls are solid maroon with a 40pt white letter, and the closed Berkshire stays a plain white tile with a grey letter. That is the one bold move, and it does real work, because "which hall is open now" is the screen's job.
2. I dropped the proposal's scale-back of the presenting view at the medium detent. On iOS, a medium-detent sheet only dims what's behind it. The scale-back belongs to the large detent (see motion). Drawing it here would read as almost-native, which is worse than plain.
3. Removed accessory: a bottom tab bar. The app is a stack and the real tab labels aren't settled, so I didn't invent one. Profile is a single glass button in the toolbar.
4. Station index segments went from 4px to 3px wide, and their heights are proportional to each station's dish count (4, 3, 4, 3, 3, 2, 2). The grey segments were competing with the list.
5. Moved the list up 6px and tightened the section gaps so the plate bar floats over a dish row rather than clipping "Street Food" mid-glyph. A row under the bar is also what shows the material.
6. The longest dish name, "Golden BBQ Chicken Thigh", was wrapping beside its stepper once the menu rows gained 20 of trailing padding to clear the index gutter. I fixed it by applying SF's real -0.41 body tracking and tightening the row gaps, not by shrinking the 44pt stepper halves. I also shortened the sheet from 452 to 440 so it sits at the medium detent without a dead band above the button.
7. "Add something else" is the last row of the plate group, a tinted magnifier with tinted text. It is the iOS "add item" row idiom, not a second button competing with Log.

## (c) Motion and feel

**Sheet detents** (`UISheetPresentationController`, or `@gorhom/bottom-sheet` with matching values):
- **Detents:** medium is 440pt visible (about 52%); large is full height minus the top safe inset. The grabber is visible, and swiping down dismisses.
- **Medium:** floats inset 8pt with a 40pt radius. The presenting view dims to `rgba(0,0,0,0.28)` and is not scaled.
- **Medium to large:** the sheet goes edge to edge and its bottom corners square off. The presenting view scales to 0.92, with a 10pt top-corner radius, and the dim deepens to 0.4. This is interactive and follows the finger.
- **Presentation:** spring, 500ms, `cubic-bezier(0.32, 0.72, 0, 1)` (the iOS sheet curve), with damping 1.0 so it doesn't overshoot.
- **Dismissal:** 350ms, same curve. A fling velocity above 1000pt/s dismisses from either detent.

**Haptics:**
- `selection`: each new segment in the meal control; each station crossed while scrubbing the index; each day stepped in the date stepper.
- `impact(.light)`: adding a dish (+) and each stepper tap.
- `impact(.rigid)`: the stepper reaching 0, when the row reverts to its add button.
- `notification(.success)`: Log completes.
- No haptic on navigation pushes, which is system behavior.

**Press feedback:**
- Cells highlight with `#d1d1d6` on touch-down, set immediately. They fade out over 250ms with `cubic-bezier(0.25, 0.1, 0.25, 1)`.
- Glass buttons and capsules scale to 0.96 on press: 120ms in with `cubic-bezier(0.2, 0, 0, 1)`, then spring back over 300ms.
- Steppers dim the pressed half to 0.5 opacity.
- The maroon tiles scale to 0.97 with the same timing as the buttons.

**Signature motion: add to plate.**
- Tapping a row's + morphs the 30pt add circle into the stepper capsule. The width grows from 44 to 96 over 280ms with `cubic-bezier(0.34, 1.3, 0.64, 1)`, a small overshoot, and the count fades in at 120ms.
- At the same time, the plate bar's "3 items, 404 cal" rolls its digits vertically over 240ms with `cubic-bezier(0.2, 0, 0, 1)`.
- If the plate bar isn't on screen yet, it rises from below with the sheet spring.
- Nothing else in the app moves on its own.

**Station index:**
- Touch-down anywhere in the 44pt-wide right gutter (x 346–390; cell controls end at x 346 because trailing cell padding is 20 on this screen) starts a scrub. The index widens from 3 to 5pt over 150ms, and the station header under the finger jumps into place, as Contacts does.
- The active segment re-colors immediately. There's no animation while scrubbing.

**Reduced motion:** all springs become 200ms opacity cross-fades, the add-circle morph becomes an instant swap, and the digit roll becomes a plain change.
