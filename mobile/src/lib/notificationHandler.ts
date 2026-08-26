import * as Notifications from "expo-notifications";

// #273: with no handler registered, expo-notifications' own default is to NOT show a notification
// that arrives while the app is foregrounded (see its NotificationsHandler.d.ts) -- so a
// favorited-food alert or a ping silently never surfaces if the user has the app open. Extracted
// out of _layout.tsx as its own small, directly-testable unit (see notificationHandler.test.ts) --
// layoutNotificationHandler.test.ts separately imports the real _layout.tsx to pin that it's
// actually wired in there, since a unit test of this function alone can't catch _layout.tsx
// forgetting to call it.
//
// Sound/badge off is a product call, not a technical constraint -- flip shouldPlaySound/
// shouldSetBadge to true if the owner wants it louder. No response listener here: tapping a
// notification just foregrounds the app wherever it was (verified safe with a stale/absent
// session) -- deep-linking to the inbox/hall on tap is a separate product decision, not built here.
export function registerNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
