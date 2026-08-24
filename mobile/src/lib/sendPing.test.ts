import { Alert } from "react-native";
import { sendPingGuarded } from "./sendPing";

// Same rationale as friendProfileScreen.test.tsx: spy on the real Alert.alert rather than
// jest.mock("react-native", ...) wholesale, which fights jest-expo's native-module registration.
let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

function fakeSupabase(insertResult: { data: null; error: unknown }) {
  return { from: jest.fn().mockReturnValue({ insert: jest.fn().mockResolvedValue(insertResult) }) };
}

describe("sendPingGuarded", () => {
  it("issue #146: surfaces the error and reports failure when the pings insert is rejected (e.g. RLS: not actually friends)", async () => {
    const supabase = fakeSupabase({ data: null, error: { message: "row-level security policy violation" } });
    const ok = await sendPingGuarded(supabase, { sender_id: "me", receiver_id: "friend-1", hall_tid: 1, message: null });
    expect(ok).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith("Couldn't send ping", expect.any(String));
  });

  it("reports success and does not alert when the insert succeeds", async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    const ok = await sendPingGuarded(supabase, { sender_id: "me", receiver_id: "friend-1", hall_tid: 1, message: null });
    expect(ok).toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
