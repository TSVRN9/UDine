jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { dismissSharedStatsDisclosure, hasSeededSharedStatsDefault, isSharedStatsDisclosureDismissed, markSharedStatsDefaultSeeded } from "./sharedStatsSeed";

describe("shared-stats default-on seed marker (#248 Part C)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("is not seeded before anything writes the flag", async () => {
    expect(await hasSeededSharedStatsDefault("alice")).toBe(false);
  });

  it("markSharedStatsDefaultSeeded persists the flag so hasSeededSharedStatsDefault reflects it", async () => {
    await markSharedStatsDefaultSeeded("alice");
    expect(await hasSeededSharedStatsDefault("alice")).toBe(true);
  });

  it("is keyed per user -- seeding one account doesn't mark another as seeded", async () => {
    await markSharedStatsDefaultSeeded("alice");
    expect(await hasSeededSharedStatsDefault("bob")).toBe(false);
  });
});

describe("shared-stats disclosure dismissal marker (#248 Part C)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("is not dismissed before anything writes the flag", async () => {
    expect(await isSharedStatsDisclosureDismissed("alice")).toBe(false);
  });

  it("dismissSharedStatsDisclosure persists the flag independently of the seeded marker", async () => {
    await dismissSharedStatsDisclosure("alice");
    expect(await isSharedStatsDisclosureDismissed("alice")).toBe(true);
    expect(await hasSeededSharedStatsDefault("alice")).toBe(false);
  });
});
