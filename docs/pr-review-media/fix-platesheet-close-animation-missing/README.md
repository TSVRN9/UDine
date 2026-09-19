# PlateSheet close animation -- device evidence

Route: `halls/franklin?stress=lookup-hit` (auto-opens PlateSheet with search expanded and
populated), `--device Agent_Emulator_Wide`, tap on the scrim (300, 80) to close.

- `halls-franklin-stress-lookup-hit-close-Agent_Emulator_Wide.{mp4,json,metro.log}` -- the
  primary capture at this PR's head commit (sha in the `.json` sidecar), full recording +
  metro log.
- `after-frames/` -- three representative native-resolution frames extracted from that mp4:
  `open.png` (fully open, search results populated), `closing.png` (mid-close: panel visibly
  translated down, search results still populated -- the fix), `closed.png` (fully closed).
- `before-3cbefec-parent/` -- the same three states captured at `3cbefec` (this branch's parent
  commit, pre-fix) for comparison: `open.png`, `closing-content-blanked.png` (mid-close: panel
  translated down, but content already reset to blank "Your Plate" + divider -- the bug: the
  `[visible]`-keyed reset effect wiped the search UI before the close tween finished), `closed.png`.

Both captures show a real panel translation mid-close at this frame rate/device -- the fix's
observable difference is that closing content stays populated (matching what the user was just
looking at) instead of flashing blank partway through the slide. A sparser 7fps frame sample taken
earlier during this investigation appeared to show the pre-fix panel disappearing in a single frame
with no slide at all; a denser native-frame extraction (this directory) shows that was a sampling
artifact, not a zero-frame vanish, on this emulator/Android build. The content-reset defect is real
and reproducible either way (see `before-3cbefec-parent/closing-content-blanked.png`), and is the
most likely explanation for the reported on-device "just vanishes" symptom -- a slower real device
under the same content-teardown contention would plausibly drop more of the close tween's frames
than this x86_64 emulator does. See the PR body for the full reasoning and the reviewer notes on
residual uncertainty against the original real-device report.
