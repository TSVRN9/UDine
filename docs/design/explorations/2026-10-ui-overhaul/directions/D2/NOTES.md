# D2: Open exploration (station signage)

Each dining hall is laid out as a set of stations, so D2 takes its visual language from transit wayfinding. Every hall gets a line color and a round letter bullet. A hall's menu is drawn as its line, with each station as a stop. The metaphor stays in the visuals only. All copy is plain dining language: "Open until 9", "Your plate", "Log 3 items".

## (a) Token plan

**Color**

| Name | Hex | Role |
|---|---|---|
| Enamel | `#EEF1EF` | Ground. A cool porcelain-enamel white with no cream. |
| Panel | `#F8F9F7` | Raised enamel, used for the plate sheet. |
| Signal ink | `#18233A` | Text, steppers, plate bar, current stop. Navy-black (13.8:1 on enamel). Not #111. |
| Slate | `#56606F` | Secondary text and closed status (5.6:1 on enamel). |
| Rule | `#D2D8D9` | Row dividers and the sheet grabber. |
| Line colors | Worcester `#C41230`, Franklin `#0B5CA8`, Hampshire `#13784A`, Berkshire `#F2B31B` | One per hall. Text on them: white on red, blue and green (6.0, 6.8, 5.5:1); ink on yellow (8.4:1). |

Supporting values: `#AEB6C2` for secondary text on ink (7.7:1), and `#9AA3AD` for an out-of-service (closed) spur. Yellow is only 1.6:1 against enamel, so every yellow mark gets a 1.5px ink casing, the way transit maps outline yellow lines. Nothing about closed status is carried by color alone, because the status text always says it.

**Type:** Overpass (Google Fonts, derived from Highway Gothic) is the only family, in weights 400, 600, 700 and 800. Every number uses `font-variant-numeric: tabular-nums`. I checked in a render that Overpass honors `tnum`: "111" and "404" come out the same width. No monospace anywhere.

| Size/line | Weight | Use |
|---|---|---|
| 44/48 | 800 (−0.8 tracking) | Meal name on Home |
| 31/36 | 800 | Hall name on the menu |
| 26/32 | 800 | "Your plate" |
| 24 | 800 | Hall rows on Home, sheet totals |
| 19/24 | 800 | Station headers, "Cafés & markets" |
| 16–18 | 600–800 | Dish names, plate bar summary, buttons, date |
| 15 | 600–800 | Meal tabs (800 when selected) |
| 14/18 | 400–600 | Dish meta, secondary status |

Everything is in sentence or title case, with no tracked caps.

**Radii by role, not one radius everywhere:**
- full circle: roundels, stops and the add button;
- 22px pill: quantity stepper;
- 10px: Log and the search field;
- 16px: sheet top corners;
- 0: rows. Rows are not cards. They sit directly on the enamel, divided by 1px rules.

**Spacing:** 20px page gutter and a 4px base step. Rows run 62–66px, and every control is 44px or more. The rail is a 44px column on the right edge (x 346–390), and the list ends at 346px so a stepper never sits under the rail.

## (b) Self-review against the generic tells

- **Literal departures board, rejected.** A dark flip-dot or LED panel would have been tell #2 (near-black with a bright accent). I kept enamel signage instead. "Departures" survives only as the layout: names on the left and status in a right-aligned column.
- **Tracked caps.** Signage pulls toward ALL CAPS. Highway Gothic signs are mixed-case, so everything here is sentence case.
- **Middle dots.** Dish meta is "93 cal" and "13.3g protein" as two spaced spans. The sheet context reads "Worcester lunch". Status sits in its own column and is never joined to the name.
- **Card kit.** There are no cards. Halls, dishes and cafés are rows on the ground, and the plate bar is one solid ink panel.
- **Hero stat.** The sheet totals are a ruled sum line: a 2px ink rule, as in a receipt total, then four equal 24px figures. There's no gradient and no oversized single number.
- **Red was being spent everywhere.** The first plan had red steppers too. I made the steppers ink, so Worcester red appears only as the bullet, the tab underline, the rail and Log.
- **Berkshire, first pass.** I drew a hollow yellow ring plus a cased yellow spur. It read as a thermometer, and the cased dashes looked like a chain. Now the closed spur is a grey dashed stub, the transit convention for a line that's out of service. The ring keeps its ink casing, and "Opens at 4:30" does the actual telling.
- **Tabs.** "Grab 'N Go" was clipped at 390px. I tightened the tab gap from 16 to 13px, so all five fit with no scroll.
- **Accessories removed:** a clock on Home, chevrons on every row, plate-count ticks on rail stops, a "served until" line, and the barcode sub-caption under "Add something else".
- **Known risk.** The rail is quiet until it's touched, and nothing on it names the stops at rest. That's deliberate, because labels would be captions. It depends on the drag readout below.

## (c) Motion and feel

**Plate sheet detents**

| Detent | Sheet top | What shows |
|---|---|---|
| Collapsed | y 750 | The 94px ink plate bar |
| Medium | y 416, about 51% | The artboard |
| Large | y 64 | The hall header stays visible, dimmed |

- Settling: 380ms `cubic-bezier(0.32, 0.72, 0, 1)`.
- Dimming: ink scrim to 55% opacity, 240ms `cubic-bezier(0.2, 0, 0, 1)`.
- A release with velocity of 600 pt/s or more skips to the next detent in the direction of travel.

**Haptics**

| Moment | Haptic |
|---|---|
| Adding a dish (+) | Light impact |
| Stepper −/+ | Selection tick |
| Stepper reaches 0 and the row drops off the plate | Medium impact |
| Each stop crossed while dragging the rail | Selection tick |
| Sheet lands on a detent | Soft impact |
| Log succeeds | Success notification |

**Press feedback**
- Buttons and steppers scale to 0.96 in 90ms `cubic-bezier(0.2, 0, 0, 1)` and release in 160ms `cubic-bezier(0.34, 1.4, 0.64, 1)`.
- Rows tint to `#E2E7E6` on press-in, with no scale.
- The stepper count rolls vertically: the old digit leaves upward and the new one enters from below, 160ms `cubic-bezier(0.2, 0.8, 0.2, 1)`.

**Signature motion: the rail**
- Scrolling the list moves the filled ink stop along the hall's line to the station whose header is topmost. It travels 180ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, and the 4px enamel ring scales 1 → 1.15 → 1 on arrival (240ms `cubic-bezier(0.34, 1.4, 0.64, 1)`).
- Dragging the rail moves the stop with the finger and snaps it to the nearest station, with a selection tick at each stop.
- During the drag, the station's name slides out to the left of the stop in 19/800 ink on enamel (140ms `cubic-bezier(0.2, 0, 0, 1)`). The list jumps to that station, and the name fades out over 160ms `cubic-bezier(0.4, 0, 1, 1)`, starting 200ms after release.
- On Home, the hall bullets don't animate. Opening a hall is a standard push (350ms `cubic-bezier(0.32, 0.72, 0, 1)`), so the rail is the only motion with a personality.
- Reduced motion: the stop moves instantly with no ring pulse, and the sheet cross-fades in 150ms `cubic-bezier(0, 0, 1, 1)`.
