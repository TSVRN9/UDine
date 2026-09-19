# PlateSheet close animation -- device evidence

Route: `halls/franklin?stress=lookup-hit` (auto-opens PlateSheet with search expanded and
populated), `--device Agent_Emulator_Wide`, tap on the scrim (300, 80) to close.

`halls-franklin-stress-lookup-hit-close-Agent_Emulator_Wide.{mp4,json,metro.log}` is the primary
capture at this PR's head commit (sha in the `.json` sidecar) -- the gated screenshot evidence.
`ffmpeg -vsync 0` over that mp4 (native ~11-12fps, not the 7fps sampling `--record` extracts by
default) shows the panel visibly translated partway down mid-close, with the search results still
populated (not reset to the idle "Your Plate" blank state) -- confirming the fix: content -- and
the panel -- now stays stable through the ~300ms close tween instead of the reset effect wiping it
mid-slide.

A same-technique capture at `3cbefec` (this branch's parent commit, pre-fix) shows the same
mid-close panel translation, but with content already reset to blank ("Your Plate" + a divider,
nothing else) by that point -- the bug this PR fixes. Both pre- and post-fix captures show a real
panel translation at this frame rate/device; a sparser 7fps sample taken earlier in this
investigation appeared to show the pre-fix panel disappearing in a single frame with no slide at
all, but the denser native-frame extraction above shows that was a sampling artifact on this
emulator/Android build, not a literal zero-frame vanish. The content-reset defect itself is real
and reproducible either way, and is the most likely explanation for the reported on-device "just
vanishes" symptom -- a slower real device under the same content-teardown contention would
plausibly drop more of the close tween's frames than this x86_64 emulator does. See the PR body for
the full root-cause writeup and the residual uncertainty against the original real-device report.
