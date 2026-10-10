# M2 transition audit (round 6)

Owner: "Opening nutrition information from the search doesn't make sense in its transition, I'd like you to audit the
rest of the transitions in M2."

Every transition below was recorded with `rec.js` (app time 8× slow) before and after the fix, and judged from the frames.
`compare-<interaction>.png` shows "M2 r5b (before r6)" above "M2 now" (older rounds above that where they exist). Frame
times are the strip labels.

## The test each motion has to pass
What did the student touch, and what is the destination to it?
- **A card or row that names an object** (a hall, a café, an event, a dish, an area, a You row) *becomes* that object's
  screen. That is a container transform: Material's list→detail / card→detail, and the App Store/Music zoom.
- **A control that asks for something** (Log, Full label, Add custom food, the station switcher, the plate bar) raises a
  sheet from the bottom edge. The sheet isn't the control grown; the control stays where it is under the scrim.
- **Peers** (Halls / Search / You; Breakfast / Lunch / Dinner) swap in place: fade through, shared axis.
- **Everything else** changes in place.

## Inventory and verdicts

| # | Transition (trigger; back) | Convention, and why | What it did before (frames) | Verdict |
|---|---|---|---|---|
| 1 | **Dish row in Search → nutrition detail** (tap the name; back, drag down, edge swipe) | Container transform into a **page**. The row names the dish; the detail is the dish. | It grew into a *bottom sheet* (grab handle, rounded top, mid detent). A Search row sits at y≈175, above the sheet's top (118), so the "rising" sheet unrolled **downward** from under the chips like a dropdown (`searchdetail` +20…+100); the grab handle was painted on the row from frame 1 (+2, +39); the chalk container on chalk read as the list being wiped. Dragging it down and letting go sent it **up** past where the finger left it into the row (`searchdetaildrag` +398…+459). The search field kept focus, so on a phone the keyboard stayed up over the label. | **Changed** (sheet → page). Cause: two models (sheet, container transform) that only agree when the row is below the sheet. |
| 2 | Dish row in a hall menu → detail | Same as 1: one model for the same object everywhere. | The same sheet; it happened to rise because menu rows sit low. Content rode the sheet's top edge ~100 px while fading in (`detail` +128…+450). | **Changed** (page). |
| 3 | "Later today" dish row → detail | Same as 1. | Same as 1. | **Changed** (page). |
| 4 | Detail → Add to plate | Reverse of 1, then in place: the page returns to its row, `+` becomes the stepper, the bar updates. | Same idea via the sheet. | **Changed** (page close, then the in-place change). |
| 5 | Detail → hall tag (serving) | Reverse of 1, then the same row grows into the hall (container transform, hall lies still), then the list scrolls to the dish. | Same chain via the sheet; the hall rode up with the window (see 12). | **Fixed** by 1 and 12. The closing scroll is a second, separate motion (see "Unsure"). |
| 5b | Dish page opened **inside a hall menu** → a hall tag (`servinghall`) | Halls are peers: the page returns to its row, then the hall swaps for the other in place with the tabs' overlapped fade through, arriving at the dish. | The menu vanished in one frame, the Halls rack showed, and the other hall grew out of its band (+420…+500): a cut in the middle of the chain (same under the sheet). | **Fixed** (peer swap, `swapHall`). |
| 6 | Pinned café → café page (back, drag, edge) | Container transform, **band model**: a pin is a hall band at ¾ scale, and its photo has the page photo's width, so the window into that photo grows and the page hangs from it (as hall band → hall). | The photo lerped on its own path while the page content rode the container's top edge: two motions; the content landed 30 px from where it faded in; the bar faded as a whole (pink); the photo slot's maroon ground showed as an empty pad (`pinopen` +89…+170). The outgoing copy sat 1 px off its card (`.pcard`'s margin). | **Fixed** (shared cause A, B). |
| 7 | Café thumbnail row (Search result, Cafés list) → café page | Container transform with a **travelling picture**: the 64 px thumbnail scales into the page photo over a page that lies still (the event model). | Content rode the top edge while the thumb lerped; translucent bar; empty maroon slot (`placeopen` +87, +130). | **Fixed** (A). |
| 8 | Event card → event page (back, drag, edge, peeking card) | Container transform, travelling framed banner (round 5b). | Already right. | **OK** (rebuilt on the shared path, re-recorded, 5b test still green). |
| 9 | Event note row inside a hall → event page | Container transform from a chalk row: no shared picture, the page lies still, its maroon bar and band are opaque where the window reaches them. | The whole bar and band faded as one translucent maroon slab, riding the container edge; the ghost row slid up (`evnote` +61…+130). | **Fixed** (A). |
| 10 | Area row → Cafés & markets; You rows → Favorites / Diet / Rank / Export | Container transform from a chalk row (as 9). | Translucent bar fading as a whole; content riding the edge (`areaopen` +92…+134). | **Fixed** (A). |
| 11 | Hall band → hall (back, drag down, edge swipe, from collapsed) | Container transform, band model. | Right, except the meal-tab and station rows faded as translucent maroon (pink) bars. | **OK**; the two rows are now opaque ground with fading labels. |
| 12 | Search hall row → hall (and back) | Container transform from a chalk row: the hall lies still under the window. | The whole hall rode the window's top edge down 90–450 px while fading in (`hallresult` +93: tabs at 450 vs 306 at rest). | **Fixed** (A, hall side). |
| 13 | Plate bar → plate sheet (tap, drag, fling) | Bottom sheet whose handle is the bar (Music mini-player). | Right. | **OK**. |
| 14 | Station row → station list | Bottom sheet (a picker). | Right. Picking scrolls the list (native-speed scroll in recordings). | **OK**. |
| 15 | Full label (plate sheet) | Bottom sheet over the plate sheet: "Full label" is a text button, not an object with a container. | Grew out of the small text button: the container widened rightward from the bottom-left corner, its content clipped at the right edge, while the plate's own totals panel showed through beside an incoming second label (`platelabel` +93…+131). | **Changed** (plain sheet). |
| 16 | Add custom food (Search, café menu `+`) and its submit | Bottom sheet: a form that brings the keyboard. | Grew out of the button with the same downward unroll as 1; the button's copy jumped 20 px right / 8 px down at frame 1 (`.custom`'s margin beat `.trav`'s). Submit shrank back into the button. | **Changed** (plain sheet; submit closes it and the bar updates). |
| 17 | Halls ⇄ Search ⇄ You | Fade through, overlapped (owner, round 3). | The two headers double-expose mid-fade, misregistered by the 0.97 scale (`tabs` +37, +80). | **OK** as the owner asked; see "Unsure". |
| 18 | Breakfast ⇄ Lunch ⇄ Dinner | Shared axis X. | Right. | **OK**. |
| 19 | `+` → stepper, quantity, remove | In place. | Right. | **OK**. |
| 20 | Log / Undo | In place (snackbar in the bar's slot). | Right. | **OK**. |
| 21 | Typing, lens chips | In place: FLIP, fades; chips never move. | Right. | **OK**. |
| 22 | Ingredients | In place (height). | Right (now inside the dish page). | **OK**. |
| 23 | Header collapse | Scroll-scrubbed. | Right. | **OK**. |

## Shared causes
- **A. The page container transform (`contPrep`/`contPaint`) had no rule for what moves.** Content rode the container's top
  edge, the shared photo moved on its own path, the bar's ground faded with its contents, and the photo slot's ground was
  drawn empty. Round 5b had fixed this for event cards only. Now one rule covers every page and the hall from a row:
  only the window's edges and the shared picture move; everything else fades where it is; grounds are opaque.
- **B. Ghost copies were offset by their source's own margin** (`.pcard` 1 px, `.custom` 20/8 px): `ghostOf` now sets
  `margin:0` inline.
- **D. A hall → hall jump had no convention**: it closed one screen instantly and opened the other from Halls. Halls are peers, so they now fade through in place.
- **C. One object, two models.** The dish detail was a bottom sheet entered by container transform. The two only agree when
  the row sits below the sheet; in Search they disagree on every open and every drag. Button-opened sheets (Full label,
  custom food) had the same hybrid.

## Unsure (for the owner)
- **Drag-down on a page from a Search row.** The page scrubs back toward its row (the window's bottom edge rises faster
  than the finger moves down), as the event page already does. iOS's zoom dismiss also lets the card follow the finger;
  this prototype doesn't (unchanged from 5b).
- **Tabs.** The overlapped fade double-exposes the two headers for ~100 ms. Dropping the 0.97 scale would at least register
  them; returning to the dip brings back the white flash the owner rejected.
- **Serving → hall then scroll.** The hall opens at its top and then scrolls to the dish (two motions).
- **Dish page bar.** The page bar carries only Back; the dish name stays as the page's large title rather than moving
  into the bar.
