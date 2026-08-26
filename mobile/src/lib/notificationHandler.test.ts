const mockSetNotificationHandler = jest.fn();
jest.mock("expo-notifications", () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
}));

import { registerNotificationHandler } from "./notificationHandler";

// #273: fails on main -- setNotificationHandler is never called anywhere, so a push arriving
// while the app is foregrounded is silently dropped (expo-notifications' own default behavior).
test("registers a handler that shows foregrounded notifications", async () => {
  registerNotificationHandler();

  expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
  const handler = mockSetNotificationHandler.mock.calls[0][0];
  await expect(handler.handleNotification()).resolves.toEqual({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  });
});
