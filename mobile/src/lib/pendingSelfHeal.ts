/**
 * #264 review round 4: favoriteFoodAlerts.ts's self-heal (refresh() -> reregisterPushToken) can
 * still be mid-flight -- a real Expo push-token network round trip -- when the user taps "Sign
 * out". Two earlier attempts at this (a pre-upsert flag, then a post-upsert "compensating delete"
 * epoch counter) both failed: the epoch approach's compensating delete fired *after*
 * auth.signOut() had already cleared the session, so it 403'd (push_tokens has no anon grant) and
 * the resurrected row stayed -- reviewer-reproduced, not theoretical.
 *
 * The fix that actually closes it is ordering, not detection: auth.ts's signOut() awaits whatever
 * self-heal is registered here -- bounded, so a hung fetch can't hang sign-out -- BEFORE its own
 * delete, and BEFORE calling auth.signOut(). Either the self-heal finishes (and signOut()'s own
 * delete removes whatever it wrote, with a still-live session) or it never started. No epoch, no
 * compensating write, nothing to race.
 *
 * Split into its own module (not exported from auth.ts) so favoriteFoodAlerts.ts doesn't have to
 * import auth.ts's expo-linking/expo-web-browser side effects (WebBrowser.maybeCompleteAuthSession()
 * at module load) just to register a promise.
 */
let pending: Promise<void> | null = null;

export function registerPendingSelfHeal(promise: Promise<void>): void {
  pending = promise;
}

export function pendingSelfHeal(): Promise<void> | null {
  return pending;
}
