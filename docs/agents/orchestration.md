# Orchestration

How the top-level session (the orchestrator — run it on **Sonnet**; the job is routing and context
assembly, not deep reasoning) turns a task into dispatched agent work. Read this at the start of any
session that will dispatch agents.

## Loop

1. **Intake.** A task arrives from the human — inline, or as a GitHub issue number (`gh issue view <n> --comments`).
   Agents never file issues for each other.
2. **Triage** by blast radius per `dev-tracks.md`: XS/S → `quick-fixer` (→ `spot-checker`); M → `issue-solver`
   (→ `pr-reviewer`); L → `heavy-debugger` only through the gate below. When in doubt, one track heavier.
3. **Assemble context.** The dispatch prompt is the agent's whole world. Include:
   - Task description and the acceptance criteria (per-criterion, checkable).
   - Files involved (paths), and callers you already know about.
   - Context excerpts: the relevant rows of `CLAUDE.md`'s residency table, the `docs/decisions-log.md` /
     `docs/auth-status.md` section for the area, the ADR if one applies. Paste the excerpt — don't
     make the agent go find it. Keep it to what this task needs.
   - Authorization scope: worktree/branch, base branch, whether it may commit / push / open a PR /
     merge (merge is owner-gated; see memory). Default: open a PR, don't merge.
   - Lanes to run (from the `ci.yml` header) — name them, so the agent doesn't run the full matrix
     "to be safe"; say explicitly when `supabase test db` is not needed.
   - Red-first requirement: failing test first, red output pasted, then green.
   - Issue number only if a human filed one.
4. **Dispatch** the agent with that prompt. Then the gate agent (spot-checker / pr-reviewer) with the
   diff location + the same acceptance criteria.
5. **Read the result.** Verdict MERGE → merge (if authorized). REQUEST-CHANGES/REWORK → route findings
   back to the same implementing agent. BLOCK/ESCALATE → re-triage one track heavier. Budget-cap
   report from issue-solver → see escalation.
6. **Log** (below). Optionally, if a human-filed issue exists, `gh issue comment` a receipt and close it.

## Escalation gates

- **Advisor (Opus, ad hoc — dispatch a `general-purpose` agent with `model: opus`, read-only):** for a
  design/scoping question the orchestrator can't settle from the docs — conflicting invariants, an
  ambiguous ticket whose two readings lead to different work, a residency question. Ask one
  question, get one recommendation, then dispatch normally. Not for implementation.
- **Second issue-solver attempt:** when the first attempt hit its budget cap or came back
  underspecified. Re-dispatch with what was learned added to the context excerpts, or re-scope
  (split the ticket) first. Simple implementation difficulty is this branch, not heavy-debugger.
- **`heavy-debugger` (Fable):** only when BOTH hold:
  1. `issue-solver` has already attempted and failed — its report is in hand. "This sounds hard" is
     not an attempt.
  2. The failure is genuine cross-layer complexity: native ↔ JS bridge, timing/races, intermittent
     reproduction, build toolchain. If the failure is underspecified requirements → re-scope the
     ticket. If it's ordinary implementation difficulty → second issue-solver attempt with more context.
  Pass issue-solver's full report in the dispatch.

## Task log

After each task completes (any status), append one line to `docs/agents/task-log.jsonl`:

```json
{"ts":"2026-08-26T18:40:00Z","task":"hide raw Accept on qr-origin friend requests","agent":"quick-fixer","track":"S","status":"complete","files":["web/src/routes/friends/+page.svelte"],"pr":299,"issue":256,"notes":"spot-checker MERGE; red reproduced"}
```

Fields: `ts`, `task`, `agent`, `track`, `status` (`complete` | `escalated` | `failed`), `files`,
optional `pr`/`issue`, `notes` (verdict, what was skipped, what's unverified). `echo '...' >> docs/agents/task-log.jsonl`
— zero API calls. This is the audit trail; GitHub comments are optional receipts for humans on top.
