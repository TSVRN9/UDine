import AsyncStorage from "@react-native-async-storage/async-storage";
import { dismissFirstRun, isFirstRunDismissed } from "./firstRun";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("firstRun flag", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("is not dismissed before anything writes the flag", async () => {
    expect(await isFirstRunDismissed()).toBe(false);
  });

  it("dismissFirstRun persists the flag so isFirstRunDismissed reflects it", async () => {
    expect(await isFirstRunDismissed()).toBe(false);
    await dismissFirstRun();
    expect(await isFirstRunDismissed()).toBe(true);
  });
});
