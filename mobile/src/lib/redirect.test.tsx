// Lives here, not next to src/app/redirect.tsx: expo-router scans every file under src/app/ as a
// candidate route (confirmed on-device -- a .test.tsx there gets bundled into the real app and
// crashes at runtime on the bare `jest` global). No other route file has a colocated test for the
// same reason; this one imports the screen by relative path instead.
jest.mock("./auth", () => ({
  exchangeCode: jest.fn(),
  isSignInInFlight: jest.fn(() => false),
  shouldExchangeCode: jest.fn((code: unknown, inFlight: boolean) => typeof code === "string" && !inFlight),
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: jest.fn(),
  Redirect: () => null,
}));

import { Alert } from "react-native";
import renderer, { act } from "react-test-renderer";
import * as expoRouter from "expo-router";
import RedirectScreen from "../app/redirect";
import * as auth from "./auth";

const mockedAuth = auth as jest.Mocked<typeof auth>;
const mockedUseLocalSearchParams = expoRouter.useLocalSearchParams as jest.Mock;

// #54's own complaint was a cold-start failure landing the user silently signed out. A
// console.error-only catch repeats that with a visible toast instead of a screen -- invisible in
// a release build. This checks the fix reuses index.tsx's Alert.alert, which is native and
// survives this screen's immediate <Redirect> unmount.
describe("RedirectScreen cold-start exchange failure", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("surfaces a failed cold-start exchange via Alert.alert", async () => {
    mockedUseLocalSearchParams.mockReturnValue({ code: "bad-code" });
    mockedAuth.exchangeCode.mockRejectedValue(new Error("invalid flow state"));

    await act(async () => {
      renderer.create(<RedirectScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Alert.alert).toHaveBeenCalledWith("Sign-in failed", "invalid flow state");
  });
});
