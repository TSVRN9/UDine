// Lives here, not next to src/app/_layout.tsx, for the same reason as layoutNotificationHandler.test.ts
// (expo-router scans everything under src/app/ as a candidate route) -- imports the real root layout
// by relative path so this fails if _layout.tsx stops wiring registerBackgroundTask() in, not just
// if backgroundTask.ts's own behavior regresses (backgroundTask.test.ts covers that).
import * as BackgroundTask from "expo-background-task";
import { BACKGROUND_TASK_NAME } from "./backgroundTask";

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(),
}));
// backgroundTask.ts (task 3) pulls in ./supabase for its signed-out notification-match gate, which
// pulls in @react-native-async-storage/async-storage -- unmocked, that throws immediately under jest
// (no native module). This test only cares about the registration wiring, so a bare stub is enough.
jest.mock("./supabase", () => ({ supabase: { auth: { getSession: jest.fn() } } }));

const mockRegisterTaskAsync = BackgroundTask.registerTaskAsync as jest.Mock;

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("root layout registers the background task on import", async () => {
  mockRegisterTaskAsync.mockResolvedValue(undefined);

  require("../app/_layout");
  await flush();

  expect(mockRegisterTaskAsync).toHaveBeenCalledWith(
    BACKGROUND_TASK_NAME,
    expect.objectContaining({ minimumInterval: expect.any(Number) }),
  );
});
