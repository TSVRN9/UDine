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
   The gate diffs a PR against its own base branch (`gh pr create --base X` → `pr-gate.sh --base X`;
   `pr-gate.sh <pr>` reads the PR's `baseRefName`), so a stacked child is judged only on its own files.
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
`SendMessage` it — nothing wakes it. `issue-solver`, `pr-reviewer`, and `heavy-debugger` all have
hooks that block `run_in_background` and bounce a waiting stop once with the literal foreground-poll
command. If one still stalls, resume it with exactly: `timeout 600 bash -c 'until CHECK; do sleep
10; done'` in one foreground Bash call, timeout raised to 600000 ms — the literal command, not
advice. The stop-hook bounce only fires once per agent (by design, to avoid a bounce loop) — a
second stall needs you to intervene by hand, same as the first bounce never having fired.

**A nested `Agent` dispatch is just as dead as `run_in_background`/`Monitor`** (found 2026-09-14):
the `Agent` tool call itself is inherently async ("you know nothing about its results until
notification arrives"), so a subagent that spawns its own helper agent and then ends its turn
waiting on it hits the exact same failure — nothing wakes a yielded subagent, whether what it's
waiting on is a shell background job or a tool-level one. `issue-solver` now has `Agent` in
`disallowedTools` for this reason: it's a single scoped worker and should never need to sub-delegate
its own task. `heavy-debugger` keeps `Agent` (its charter needs the autonomy, and it's used it
successfully — e.g. a worktree-isolated helper to open a PR around the bash-guard.sh bug below,
without stalling).

**Isolate every dispatch, or two tasks collide in the shared checkout** (found 2026-09-14): an
`issue-solver` dispatched without an isolated worktree just works in whatever directory it starts
in — usually the top-level checkout. Two agents there at once means one's uncommitted files (even
ones it means to clean up later) sit in the tree the other's `pr-gate.sh` diffs against, and its
own `git status`/`dirty` checks see the other's mess as its own. `issue-solver` now self-checks and
self-isolates (`git worktree add .claude/worktrees/<type>-<slug> ...`) if it finds itself outside
`.claude/worktrees/`, but the orchestrator dispatching it via the `Agent` tool should still pass
`isolation: "worktree"` explicitly rather than rely on that as a backstop — it costs nothing and
avoids the self-isolation step's own overhead.

**`scripts/hooks/bash-guard.sh` used to resolve the wrong repo root, fixed 2026-09-14**: it read
`$CLAUDE_PROJECT_DIR`, an undocumented env var that stays pinned to the top-level session's
original checkout regardless of which worktree a subagent is actually in — so `gh pr create` from
an isolated worktree got gated against whatever branch/dirty-state the MAIN checkout happened to
have open, not the branch actually being created. Cost two separate agents (PR #474, #475) a
real investigation each before the mechanism was found. Fixed to resolve root from the hook
payload's own `cwd` field instead (documented as tracking the actual invocation directory,
including through `cd`) — `$CLAUDE_PROJECT_DIR` should not be trusted for this again.

## Measuring

`python3 scripts/agent-usage.py [--since YYYY-MM-DD]` — tokens by main/subagent, dispatches,
run-duration percentiles, nudge count, tokens per merged PR. Baseline 2026-09-14: 78 M cache-read
tokens per merged PR, 338 nudges / 738 runs, issue-solver p90 6 h.
