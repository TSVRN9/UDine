/**
 * #264 review round 3: a self-heal upsert (favoriteFoodAlerts.ts's refresh() -> reregisterPushToken)
 * can be mid-flight -- permission already checked, awaiting a real Expo push-token network round
 * trip -- when auth.ts's signOut() deletes that exact push_tokens row. If the upsert then lands
 * AFTER the delete, it silently recreates the row sign-out just removed, reintroducing #257 under
 * the signing-out user. Neither a pre-upsert flag check nor a pre-upsert session re-read closes
 * this: the race is the self-heal's own already-in-flight request landing late, which nothing
 * before that request is sent can see coming.
 *
 * This module is checked AFTER the self-heal's upsert resolves instead: if signOut() ran (and
 * bumped this) after the self-heal captured its own start value, the self-heal deletes the row it
 * just wrote right back out -- a compensating action taken once the outcome is known, not a guess
 * about timing beforehand.
 *
 * A plain boolean doesn't work here: it would need resetting once sign-out finishes, and nothing
 * guarantees the self-heal's after-the-fact check runs before that reset happens. A monotonic
 * counter captured at the self-heal's own start and *compared* (not just read) after its upsert
 * survives that reset -- a later, unrelated signOut() call bumping it again still correctly reads
 * as "something changed since I started."
 *
 * Split into its own module (not exported from auth.ts) so favoriteFoodAlerts.ts doesn't have to
 * import auth.ts's expo-linking/expo-web-browser side effects (WebBrowser.maybeCompleteAuthSession()
 * at module load) just to read a counter.
 */
let epoch = 0;

export function bumpSignOutEpoch(): void {
  epoch += 1;
}

export function currentSignOutEpoch(): number {
  return epoch;
}
