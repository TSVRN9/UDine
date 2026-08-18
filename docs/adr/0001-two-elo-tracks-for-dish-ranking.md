# Two independent Elo tracks for dish ranking

Dish preference needed both a per-hall signal (which hall's version of a dish do I like best, and
which halls do I favor overall) and a cross-hall signal (what's my favorite food regardless of where
it's served). We considered deriving the cross-hall Favorite Food rating from the existing per-hall
Dish ratings (e.g. averaging a name's ratings across halls) — no new state required. Instead we
maintain a second, independent Elo track keyed by dish name alone, updated by the same Pairwise
Comparison event as the per-hall track, except when the comparison is between the same dish name at
two different halls, where only the per-hall track updates — an aggregate keyed by name has no
meaningful update when both sides of the comparison share that name.

We chose the independent track because a derived (averaged) aggregate would silently blend a user's
genuinely different opinions of a dish's hall-specific execution into a blurrier signal; a second
track shaped only by comparisons between actually-different foods gives a sharper Favorite Food
ranking, at the cost of persisting and reasoning about a second piece of state.

## Consequences

Any future code that reacts to a Pairwise Comparison (e.g. a new sync path, an analytics hook) needs
to know both Elo tracks exist and are usually — but not always — updated together, and either touch
both or explicitly justify touching only one. Both tracks stay device-only, never synced, same as
the existing per-hall ranking — see the data residency table in `CLAUDE.md`.
