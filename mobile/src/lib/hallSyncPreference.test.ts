import AsyncStorage from "@react-native-async-storage/async-storage";
import { isHallSyncEnabled, setHallSyncEnabled } from "./hallSyncPreference";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

describe("hall sync preference (#285)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to enabled -- a missing key must not silently drop the pre-existing unconditional sync", async () => {
    expect(await isHallSyncEnabled()).toBe(true);
  });

  it("setHallSyncEnabled(false) persists so a later read comes back off", async () => {
    await setHallSyncEnabled(false);
    expect(await isHallSyncEnabled()).toBe(false);
  });

  it("setHallSyncEnabled(true) after an off write flips it back on", async () => {
    await setHallSyncEnabled(false);
    await setHallSyncEnabled(true);
    expect(await isHallSyncEnabled()).toBe(true);
  });
});
