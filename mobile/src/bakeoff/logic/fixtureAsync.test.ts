import { loadFixture, loadFixtureAsync } from "./fixture";

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); delete process.env.EXPO_PUBLIC_BAKEOFF_NET; });

describe("loadFixtureAsync", () => {
  it("ok resolves the fixture at once, not flagged cached", async () => {
    const fx = await loadFixtureAsync("ok");
    expect(fx.days).toBe(loadFixture().days);
    expect(fx.cached).toBeUndefined();
  });
  it("slow resolves only after 1500 ms", async () => {
    let done = false;
    const p = loadFixtureAsync("slow").then((fx) => { done = true; return fx; });
    await jest.advanceTimersByTimeAsync(1499);
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect((await p).days).toBe(loadFixture().days);
  });
  it("offline resolves the fixture flagged cached, with the clock it was saved at", async () => {
    const fx = await loadFixtureAsync("offline");
    expect(fx.cached).toBe(true);
    expect(fx.asOf).toBe(loadFixture().clock);
    expect(fx.days).toBe(loadFixture().days);
  });
  it("fail rejects with an Error the retry path can catch, and a retry in ok resolves", async () => {
    await expect(loadFixtureAsync("fail")).rejects.toBeInstanceOf(Error);
    const fx = await loadFixtureAsync("fail").catch(() => loadFixtureAsync("ok"));
    expect(fx.cached).toBeUndefined();
    expect(fx.days).toBe(loadFixture().days);
  });
  it("takes its mode from EXPO_PUBLIC_BAKEOFF_NET, and an unknown value is ok", async () => {
    process.env.EXPO_PUBLIC_BAKEOFF_NET = "fail";
    await expect(loadFixtureAsync()).rejects.toBeInstanceOf(Error);
    process.env.EXPO_PUBLIC_BAKEOFF_NET = "nonsense";
    expect((await loadFixtureAsync()).cached).toBeUndefined();
  });
});
