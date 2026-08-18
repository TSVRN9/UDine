# UDine

A calorie/macro tracker for UMass Dining. This glossary covers the domain vocabulary that isn't
self-evident from the code — see `CLAUDE.md` for architecture, build order, and the data residency
rules that constrain most of these.

## Language

**Dish**:
A food item as served at one specific dining hall — identity is `(name, hall)` together, so
"Chicken Parm @ Worcester" and "Chicken Parm @ Franklin" are different Dishes with independent Elo
ratings (`RankedDish` in `shared/src/ranking.ts`). Different halls can genuinely execute the same
recipe name differently, so a Dish's identity always includes which hall served it.
_Avoid_: Menu Item, Food (see Favorite Food below — too easily confused)

**Favorite Food**:
A Dish's identity by name alone, independent of which hall serves it — the cross-hall aggregate Elo
rating produced from the same pairwise comparisons that rate Dishes. Two halls both serving "Chicken
Parm" feed the same Favorite Food rating. A comparison between the same dish name at two different
halls updates both Dishes' per-hall ratings but does *not* update the Favorite Food rating — there's
nothing to compare when both sides share the name.
_Avoid_: Aggregate Dish, Dish

**Dining Hall Ranking**:
The full ordering of all 4 dining halls by average Dish rating, derived on-device from a user's
comparisons. Halls with enough rated Dishes get a real rank; halls without trail as "not enough data"
rather than being omitted. Only the ranked portion of this is the coarse, hall-level signal allowed to
sync to the server — see the data residency table in `CLAUDE.md`.
_Avoid_: Favorite Dining Halls (implied a top-N subset; this is now a total ordering over all 4)

**Pairwise Comparison**:
A user picking one of two logged Dishes as preferred over the other — the raw input an Elo rating
update is derived from. Never leaves the device, same as the ratings it produces.
_Avoid_: Vote, Rating (a rating is the derived number; a comparison is the raw input event)
