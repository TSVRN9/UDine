---
name: brief
description: Turn a finished design conversation (canvas iterated, or a backend decision settled) into docs/briefs/<slug>.md — the ticket every dispatch points at. Use when the owner says "/brief <slug>", "write the brief", "ticket this up", or when a feature is ready to dispatch and no brief exists.
---

# /brief <slug>

1. Copy `docs/briefs/TEMPLATE.md` to `docs/briefs/<slug>.md`.
2. Fill **Spec** from what is already on disk, not from memory:
   - `git diff --stat HEAD~5 -- docs/design/` and `docs/design/canvas.json` `annotations[]` — the
     artboards and annotation ids touched by the design iteration. Cite artboards by filename;
     `docs/design/README.md`'s table gives the component for each.
   - States: enumerate from the artboard + annotation text (every variant, boundary, empty/loading/error).
   - Backend work: name tables/RPCs, and the CLAUDE.md residency row it lands in. Write the Rationale
     here — one paragraph, decision + rejected alternative. Do not also write it to the decisions-log.
3. Fill **Acceptance** from the conversation. Each line names its evidence kind. Ask the owner only for
   criteria you cannot derive; one question, all gaps at once.
4. Fill **Tasks**: ordered, each ≤ one PR, files named, lanes named, `blocked by` set.
   Anything touching `supabase/`, auth, sync, or residency is its own task (owner-gated merge).
5. If the brief came from the canvas, tell the owner which annotation ids to suffix with
   `brief: <slug>` on the canvas (the canvas is upstream; never hand-edit an artboard).

Dispatch a task with: brief path, task number, worktree/branch, base branch, authorization
(commit / push / open PR), and "run `scripts/pr-gate.sh` before `gh pr create`". Nothing pasted.
