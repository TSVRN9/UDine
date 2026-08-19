import { withTimeout } from "./withTimeout";

describe("withTimeout", () => {
  it("resolves with the wrapped promise's value when it settles before the timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50, "test")).resolves.toBe("ok");
  });

  it("rejects with the wrapped promise's error when it rejects before the timeout", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50, "test")).rejects.toThrow("boom");
  });

  it("rejects with a labeled timeout error when the promise never settles", async () => {
    const neverSettles = new Promise(() => {});
    await expect(withTimeout(neverSettles, 20, "getExpoPushTokenAsync")).rejects.toThrow(/getExpoPushTokenAsync timed out after 20ms/);
  });

  it("accepts a thenable (e.g. a Supabase PostgrestBuilder), not just a real Promise", async () => {
    const thenable: PromiseLike<string> = { then: (resolve) => Promise.resolve("thenable-value").then(resolve) };
    await expect(withTimeout(thenable, 50, "test")).resolves.toBe("thenable-value");
  });
});
