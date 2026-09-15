// Lives here, not next to src/app/_layout.tsx: expo-router scans every file under src/app/ as a
// candidate route (see redirect.test.tsx's own note) -- imports it by relative path instead, same
// pattern as redirect.test.tsx/notificationsScreen.test.tsx.
//
// #273: notificationHandler.test.ts pins registerNotificationHandler()'s own behavior, but a test
// that only imports that module can't catch the actual bug the issue reports -- nothing at app
// startup ever calling it. This test imports the real root layout (module-scope side effects and
// all) so it fails if _layout.tsx stops wiring the call in, not just if the handler's shape regresses.
const mockSetNotificationHandler = jest.fn();
jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  scheduleNotificationAsync: jest.fn(),
}));
// backgroundTask.ts (task 3) pulls in ./supabase for its signed-out notification-match gate, which
// pulls in @react-native-async-storage/async-storage -- unmocked, that throws immediately under jest
// (no native module). This test only cares about the notification-handler wiring, so a bare stub is
// enough.
jest.mock("./supabase", () => ({ supabase: { auth: { getSession: jest.fn() } } }));

test("root layout registers a foreground notification handler on import", async () => {
  require("../app/_layout");

  expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
  const handler = mockSetNotificationHandler.mock.calls[0][0];
  await expect(handler.handleNotification()).resolves.toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});
