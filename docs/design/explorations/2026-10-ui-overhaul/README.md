# UI overhaul explorations (October 2026)

Exploration work for the mobile redesign. It's a working archive, not a spec. Once a direction is
settled, it goes onto the Mobile v2 canvas (`docs/design/README.md`) and gets re-extracted; that is
the spec.

- **Flow Lab** (every prototype, published): https://claude.ai/artifact/4bxHWnGM5soyTVQoSJhs2z
- **Canvas page** "Directions (2026-10)" holds D1–D3 as artboards: https://claude.ai/code/artifact/111ed10a-9849-4976-bea2-314d9b6cef5d
- **Plan:** `~/.claude/plans/i-d-like-you-to-magical-pine.md` (owner's machine)

## What's here

| Path | What |
|---|---|
| `directions/D1..D3/` | Three visual directions as `.dc.html` artboards and `NOTES.md` (tokens, self-review, motion). D1 "varsity" won. D3 (pseudo-native iOS) was rejected. |
| `directions/BRIEF.md`, `merge.py` | Shared brief, and the script that added the Directions page to the canvas |
| `flows/BRIEF.md` | Shared brief for the flow experiments (benchmark task, constraints) |
| `flows/F1..F4/` | Flow concepts: dish-first, habits, goal planner, one-surface tray. Each has a self-contained `index.html`, `NOTES.md` and tests. |
| `flows/M1/` | Merged flow: hall-first and search-forward, D1 varsity look plus real hall photos. Four rounds of owner feedback. |
| `flows/M2/` | M1 rebuilt on App Store / Material motion: container transform, fade-through, shared axis. See `CRITIQUE.md` and `CONCEPT.md`. |
| `flows/lab.html` | The Flow Lab index page |
| `flows/*.json` | Real UMass data snapshots: menus for Oct 8 and 9 (full nutrition fields), 40 locations with hours and busyness, events |

## What isn't committed: `local/` (gitignored)

UMass Dining's photos are their property. The halls, the 36 retail locations and the event banners
are fine to use in private prototypes but must not be redistributed from this public repo. Shipping
them in the app needs UMass Dining's permission or owner-shot replacements. So `local/` holds,
outside git:

- every built `M1/` and `M2/` `index.html` (photos are embedded as data URIs);
- all screenshots and compare strips;
- the photo assets;
- the merged canvas HTML.

It exists only on the owner's machine.

To rebuild M1 or M2 from these sources:

1. Copy `local/flows/M2/assets/` into `flows/M2/assets/` (or symlink it).
2. Run `python3 flows/M2/build.py`, which reads `../*.json`.
3. Run `node flows/M2/test.js`. It needs `playwright-core` from the repo's `node_modules` and Playwright's chromium.
