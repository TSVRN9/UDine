# <Feature name>

Goal: <one paragraph — what the user can do afterwards that they can't today>

## Spec

UI: <artboard filenames from docs/design/README.md, or "none">
Annotations: <canvas.json annotation ids that carry motion/state notes, or "none">
States: <every reachable state a screenshot must show — 0 / 0.5 / max, each variant, empty, loading, error>
Routes: <screenshot.sh route(s) + gesture, e.g. `halls/franklin --record 2 --swipe 200 700 200 300`>

Backend: <tables / RPCs / edge functions touched, or "none">
Residency: <the row of CLAUDE.md's table this lands in, and why it lives there>
Rationale: <the decision and the alternative rejected — this replaces the pre-implementation half
of a decisions-log entry; decisions-log keeps post-hoc incidents only>

## Acceptance

- [ ] <criterion> — evidence: test | screenshot | pgTAP | deno test
- [ ] <criterion> — evidence: …

## Tasks

1. <task> — files: … — lanes: … — blocked by: none — PR: 
2. <task> — files: … — lanes: … — blocked by: 1 — PR: 
