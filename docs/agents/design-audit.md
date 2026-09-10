# Design audit — per screen, repeatable

The per-diff gate can only see drift the diff caused. Drift that predates it (a re-extracted
canvas, a screen built against a superseded artboard) is found by auditing each screen against
its artboard. Run this after any `docs/design/extract.py` run and before a Play-track build.
One agent (`general-purpose`, sonnet, read-only) per row of `docs/design/README.md`'s table that
has a Component; batch findings per screen into one issue.

## Dispatch prompt (fill the three blanks)

```
Audit one screen for design-spec drift. Read-only: no edits, no PRs. Repo /home/tavern/Projects/js/UDine.

Artboard: docs/design/<FILE>.dc.html   (inline-styled HTML at 390×844)
Component(s): mobile/src/<PATHS>
Annotations: docs/design/canvas.json → annotations[] ids <IDS or "none">

For every element on the artboard, find its counterpart in the component and compare:
1. hex/rgba, font size/weight/letter-spacing, padding/gap/radius, copy strings (the artboard's
   inline style is the spec; `fs()`/`spacing()` in code resolve to artboard px at 390dp)
2. icon/asset presence per element (artboard has an <svg> here → component renders one; none → none)
3. every state the component can reach (each variant/badge kind, stepper at 0 / 0.5 / max, empty,
   loading, error) — say which states the static artboard depicts and which only the annotation does
4. motion: durations/easings must come from mobile/src/lib/motion.ts and match
   Prototype.dc.html's transitions; direction/origin must match the annotation text
5. rendered text that explains the UI (captions, legends, rationale) — a finding even if the artboard has it

Optionally render it: mobile/scripts/screenshot.sh <route> [--record N --tap/--swipe/--longpress …]
and compare the PNG/frames to the artboard.

Report one line per finding: `component:line` · artboard:line · spec value · built value ·
state it affects. Then a list of artboard elements with no counterpart, and component elements
with no artboard counterpart. No prose beyond that.
```

## After the reports

- One `gh issue create` per screen with the findings table, label `bug`, `ready-for-agent`;
  title `<Screen>: N drift findings vs <FILE>.dc.html (audit YYYY-MM-DD)`.
- Route per `dev-tracks.md` (S when confined to one component; M when a state or motion is missing).
- Log one `task-log.jsonl` line per screen audited, `agent: "design-audit"`, `ui.artboard` set,
  `notes` = finding count.
