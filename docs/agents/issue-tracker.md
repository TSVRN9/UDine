# Issue tracker: GitHub, for humans only

Work is ticketed in `docs/briefs/<slug>.md` (see `orchestration.md`). GitHub issues have one use:
a human files a bug or request. The orchestrator reads it (`gh issue view <n> --comments`), writes
or extends a brief, and dispatches from the brief. Agents never create issues for each other.

- Labels in use: `bug`, `needs-info`. Nothing else carries information.
- The PR that fixes a human-filed issue says `Closes #n` (PR template); GitHub closes it on merge.
- `gh` infers the repo from `git remote -v` (origin: `TSVRN9/UDine`).
