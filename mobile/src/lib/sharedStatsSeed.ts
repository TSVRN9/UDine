import AsyncStorage from "@react-native-async-storage/async-storage";

// #248 Part C: the persisted half of the one-time default-on seed -- see privacySettings.ts's
// shouldSeedSharedStatsDefault for the decision logic these back. Keyed per user_id (not global):
// AsyncStorage is shared across whichever account is signed in on this device, and a second account
// signing in later must get its own independent seed decision.
const SEEDED_KEY_PREFIX = "udine-shared-stats-seeded:";
// Same key also gates the one-time first-run disclosure card on privacy.tsx -- deliberately reused,
// not a second marker: the disclosure ("stats share by default") is only true for a user this seed
// actually ran for, so "seeded" and "should see the disclosure" are the same fact, not two facts
// that could drift apart. See privacy.tsx's own doc comment on the disclosure.

/** Has this device already run (or determined it should skip) the default-on seed for this user? */
export async function hasSeededSharedStatsDefault(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(SEEDED_KEY_PREFIX + userId)) === "true";
}

/** Marks the seed as done for this user -- only call after the three fields actually finished
 * pushing (see privacy.tsx's refresh()); a partial failure must be retried on the next focus, not
 * silently frozen at 2-of-3 fields on forever. */
export async function markSharedStatsDefaultSeeded(userId: string): Promise<void> {
  await AsyncStorage.setItem(SEEDED_KEY_PREFIX + userId, "true");
}

const DISCLOSURE_DISMISSED_KEY_PREFIX = "udine-shared-stats-disclosure-dismissed:";

/** Has this user dismissed the "stats share by default" first-run note? Independent of the seeded
 * marker above (a seeded user can dismiss without un-seeding), but only ever checked for a seeded
 * user -- see privacy.tsx. */
export async function isSharedStatsDisclosureDismissed(userId: string): Promise<boolean> {
  return (await AsyncStorage.getItem(DISCLOSURE_DISMISSED_KEY_PREFIX + userId)) === "true";
}

export async function dismissSharedStatsDisclosure(userId: string): Promise<void> {
  await AsyncStorage.setItem(DISCLOSURE_DISMISSED_KEY_PREFIX + userId, "true");
}
