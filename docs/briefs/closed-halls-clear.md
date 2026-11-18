# Closed halls read as closed: a dimmed band, when it opens next, no busy meter

Goal: on the Halls home, a closed dining hall is obvious at a glance, and nothing on screen claims how busy a closed
hall is. Today a closed hall's band is identical to an open one except for its status words ("Closed for today"), and
it still shows the busy meter with a word like "Probably a little busy" (reproduced 2026-11-17 on Agent_Emulator,
recorded data at `2026-10-08T21:30`: Franklin and Hampshire closed, both with lit lamps).

Owner decisions (2026-11-17, in chat):
- "when dining halls are closed id like it to be much more clear, and to get rid of the busy meter when it's closed"
- Chosen direction: **dimmed band**. A closed hall's whole band goes muted (darker, desaturated ground, photo included,
  and a dimmer name). Its status line says when it opens next (e.g. "Closed · opens 7 AM tomorrow"). Open halls keep
  full maroon. **Order is unchanged**; the owner did not pick the "closed sink to the bottom" option.

## Spec

UI: departs from M2 (`flows/M2/src.html` band/`busyRow`) on purpose; the owner's words above are the decision of
record. Applies everywhere a hall band is drawn: the Halls home bands (`app/lib/screens/halls/halls_screen.dart`,
`halls_model.dart` `buildHalls`), Search's hall cards (`search_screen.dart` `_cards`, `Band(card: true)`), and pinned
café bands when they have hours. A hall page opened from a closed band (`hall_page.dart`, `hall_header.dart`) shows
no busy meter or busy lines either. "Closed" = `!isOpenNow(hours, now)` (`app/lib/core/m2/status.dart`), so this
covers between-meal gaps as well as closed for the day.
Status words: keep `statusText`'s facts; a closed hall's line names the next opening when one is known (today or
tomorrow; the hours feed has both days), and says plainly "Closed today" or similar only when nothing opens before
tomorrow ends. No new caption beyond the status line (CLAUDE.md "No explanatory captions").
Dimming: express it as tokens in `app/lib/theme/tokens.dart`, not literals at the call site. The open↔closed swap,
if it ever happens while on screen (the clock crossing a boundary), uses an existing `M2Motion` curve; no new motion literal.
Annotations: none.

States (test each; † = screenshot in the PR, at 360 and 390):
- Halls home with some halls open and some closed † (recorded `?data=recorded&at=2026-10-08T21:30`)
- every hall closed late at night † (pick a recorded time where all four are closed)
- a hall between meals ("opens 5 PM" kind of line)
- Search hall card for a closed hall †
- a closed hall's page header: no busy meter, no busy lines
- busy unknown / offline: unchanged from today

Backend: none. Residency: none (display only).
Rationale: dimming the whole band rather than only adding a "Closed" pill makes open halls pop when scanning a list
that is otherwise four identical maroon bands; keeping order stable keeps muscle memory (the owner chose this).

## Acceptance

- [ ] A closed hall's band (home, Search card, pinned café) is visibly dimmed via tokens; an open one is unchanged. — evidence: test + screenshot
- [ ] No busy meter, busy word or busy extra line anywhere for a closed hall (band, card, hall header). — evidence: test
- [ ] A closed hall's status names its next opening when there is one. — evidence: test
- [ ] Goldens that show a closed hall are regenerated and the PR names each one. — evidence: screenshot
- [ ] No explanatory captions. — evidence: screenshot

## Tasks

1. Closed bands dimmed, next opening in the status, no busy when closed — files: `app/lib/screens/halls/`,
   `app/lib/ui/band.dart`, `app/lib/core/m2/status.dart`, `app/lib/screens/hall/hall_header.dart`, `app/lib/screens/search/search_screen.dart`,
   `app/lib/theme/tokens.dart` — lanes: flutter — blocked by: none — PR: https://github.com/TSVRN9/UDine/pull/676
