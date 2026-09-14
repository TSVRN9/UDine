# Orchestration

How the top-level session turns a design or a bug into merged code. Run it on **Sonnet** — the job
is routing, not deep reasoning. Read this at the start of any session that dispatches agents.

## Loop

1. **Brief.** Design iterated on the canvas (or a backend decision settled) → `/brief <slug>` writes
   `docs/briefs/<slug>.md`: spec (artboards, annotation ids, states, routes; or tables/RPCs +
   residency row + rationale), acceptance criteria with evidence kinds, ordered tasks. The brief is
   the ticket. GitHub issues are for human-filed bugs only (`issue-tracker.md`).
2. **Dispatch `issue-solver`** with a pointer, not a paste: brief path + task number, worktree,
   branch, base branch, authorization (commit / push / open PR — default yes, never merge), and any
   human-filed issue number. The agent reads the brief and the repo itself; pasting excerpts here
   only bloats this session's context (it averaged 343k tokens/turn before this rule).
   Parallelism: up to three UI tasks at once — one per emulator-pool device / Metro port
   (`emulator-pool.md`). Stack dependent tasks (`gh pr create --base <parent-branch>`).
3. **Gate** is mechanical: `scripts/pr-gate.sh` runs on `gh pr create` and `gh pr merge` via hooks
   (`.claude/settings.json`) — screenshot present and stamped with the merged sha, no motion
   literal outside `motion.ts`, PR template fields, lanes to run, owner-gated paths flagged.
4. **Dispatch `pr-reviewer`** with the PR number and the brief path. It runs the gate, reproduces
   reds by mutation, runs the lanes, opens the screenshots, compares to the artboard, and returns
   MERGE / REWORK / ESCALATE. It re-renders any state it needs itself.
5. **Act on the verdict.** MERGE → `gh pr merge N --squash --delete-branch` (the hook refuses when
   the gate printed OWNER-GATED: anything under `supabase/`, auth, sync, residency — post the
   verdict and leave it for the owner). REWORK → findings back to the same `issue-solver`.
   ESCALATE → see gates below. Stacked children: merge parent first, then the child rebases.
6. **Record.** Put the PR link on the brief's task line. Nothing else — the PR body is the record.

## Escalation gates

- **Advisor** (ad hoc `general-purpose` agent, `model: opus`, read-only): one scoping question the
  docs can't settle — conflicting invariants, a residency question. One question, one answer.
- **Second `issue-solver` attempt:** budget cap hit or came back underspecified → re-dispatch with
  what was learned added to the brief, or split the task. Ordinary difficulty lives here.
- **`heavy-debugger`** (Fable): only when both hold — `issue-solver` has attempted and failed
  (report in hand), and the failure is cross-layer (native ↔ JS, timing, intermittent, build
  toolchain). Pass the full report.

## Stalls

A subagent that ends its turn "waiting for" a build, capture, or Monitor is dead until you
`SendMessage` it — nothing wakes it. `issue-solver` has hooks that block `run_in_background` and
bounce a waiting stop once with the literal foreground-poll command. If one still stalls, resume it
with exactly: `timeout 600 bash -c 'until CHECK; do sleep 10; done'` in one foreground Bash call,
timeout raised to 600000 ms — the literal command, not advice.

## Measuring

`python3 scripts/agent-usage.py [--since YYYY-MM-DD]` — tokens by main/subagent, dispatches,
run-duration percentiles, nudge count, tokens per merged PR. Baseline 2026-09-14: 78 M cache-read
tokens per merged PR, 338 nudges / 738 runs, issue-solver p90 6 h.
