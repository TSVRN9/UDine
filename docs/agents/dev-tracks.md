# Development tracks

Every ticket goes down exactly one track. The orchestrator picks it at dispatch time from the
ticket's blast radius — not its label, not its size in words. When in doubt, go one track heavier.

| Track | Use for | Agents | Gate | Typical cost |
|---|---|---|---|---|
| **XS — direct** | Copy, comments, docs, assets, config values, one-line typo-class fixes. No logic change. | `quick-fixer` only | Orchestrator eyeballs `gh pr diff`, runs the one touched lane, merges | ~1 agent |
| **S — fast-track** | Bug fixes and small behavior changes confined to ≤3 files in one package; a11y labels; UI polish items with a clear spec; test-only tickets. | `quick-fixer` → `spot-checker` | spot-checker MERGE (one red reproduced, touched lane green) | ~2 light agents |
| **M — standard** | New screens/features, anything crossing packages (`shared` + a client), sync/privacy logic, edge functions, anything touching `supabase/` (migrations, RLS, grants, hooks). | `issue-solver` → `pr-reviewer` | pr-reviewer MERGE: every touched lane, every new behavior mutation-tested, invariants listed | ~2 heavy agents |
| **L — root-cause** | Intermittent, cross-layer, or previously mis-fixed bugs; native/build-toolchain problems. | `heavy-debugger` → `pr-reviewer` | As M, plus before/after repro tallies | heaviest |

## Hard rules that don't relax on any track

- Red-first evidence in the PR body; the gate reproduces at least one red.
- Nothing touching `supabase/`, auth, `shared/src/sync.ts`, or the data-residency table ever rides S or XS. `spot-checker` returns ESCALATE if it sees one; route to `pr-reviewer`.
- Local lanes only (`.github/workflows/ci.yml` header); remote CI is disabled. `supabase test db` is M/L-only.
- Merge = `gh pr merge N --squash --delete-branch` after the track's gate says MERGE. Owner-granted.
- Worktree isolation for every agent, always.

## Cost levers (what changed vs. the old single loop)

1. **Right-sized gate.** `spot-checker` (sonnet, ≤15 calls) replaces `pr-reviewer` (opus, full lane matrix) for diffs that can't violate an invariant. The full reviewer keeps its job for the diffs where a miss is expensive.
2. **Touched-lane-only on S/XS.** No full jest run for a one-file fix; `tsc --noEmit` is the cheap whole-tree safety net for mobile.
3. **Batching.** Sibling nits (e.g. #284, #213, #230) go to ONE `quick-fixer` as one PR when they share a file or a screen. One PR, one gate. Don't batch across packages.
4. **Less context loading.** `quick-fixer` reads the issue and the touched files, not `CONTEXT.md`/ADRs. Tickets that need that context aren't S.
5. **Escalation is cheap and expected.** A fast-track agent that discovers it's out of its depth stops early and reports; the orchestrator re-dispatches on M with what was learned. That's cheaper than a wrong small fix plus a full review of it.
6. **Standard track trim.** `pr-reviewer` already runs only lanes the diff touches and skips `supabase test db` when `supabase/` is untouched — dispatch prompts should say so explicitly so it doesn't run the full matrix "to be safe".

## Routing the current backlog (2026-08-26 snapshot)

- **XS:** #245 item 9 (comment cleanup — but it's a big diff by line count, so spot-check it), #284, #213.
- **S:** #230, #231, #191, #192, #194, #199, #242, #251, #258, #282, #245 items 1–8 (batch by screen; item 5 sheet backdrop and items 2/3 header/swipe may need device eyes — say so in the dispatch), #253.
- **M:** #285, #240, #239, #250, #243, #198, #189, #190, #193, #195, #256, #224, #226, #232, everything `supabase:` (#277, #234, #228, #222, #221, #202, #201, #200, #196).
- **L:** #229 (hall-card tap — already resisted one fix), #280 (cold-start OAuth residual).
