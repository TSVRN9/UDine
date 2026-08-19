jest.mock("expo-crypto", () => ({
  digest: jest.fn(async (_algorithm: string, _data: Uint8Array) => new ArrayBuffer(32)),
  getRandomValues: jest.fn((arr: Uint8Array) => arr),
}));

import { digest, getRandomValues } from "expo-crypto";
import { installWebCrypto } from "./webCryptoPolyfill";

describe("installWebCrypto", () => {
  it("wires crypto.subtle.digest to expo-crypto's digest, normalizing a string or {name} algorithm", async () => {
    const target: any = {};
    installWebCrypto(target);

    const data = new Uint8Array([1, 2, 3]);
    await target.crypto.subtle.digest("SHA-256", data);
    expect(digest).toHaveBeenCalledWith("SHA-256", data);

    await target.crypto.subtle.digest({ name: "SHA-256" }, data);
    expect(digest).toHaveBeenLastCalledWith("SHA-256", data);
  });

  it("uppercases a lowercase algorithm name (WebCrypto names are case-insensitive, expo-crypto's lookup isn't)", async () => {
    const target: any = {};
    installWebCrypto(target);

    const data = new Uint8Array([1, 2, 3]);
    await target.crypto.subtle.digest("sha-256", data);
    expect(digest).toHaveBeenLastCalledWith("SHA-256", data);
  });

  it("wires crypto.getRandomValues to expo-crypto's getRandomValues", () => {
    const target: any = {};
    installWebCrypto(target);

    const arr = new Uint8Array(4);
    target.crypto.getRandomValues(arr);
    expect(getRandomValues).toHaveBeenCalledWith(arr);
  });

  it("does not clobber an already-complete crypto global (has subtle)", () => {
    const existing = { subtle: {} };
    const target: any = { crypto: existing };
    installWebCrypto(target);
    expect(target.crypto).toBe(existing);
  });

  it("installs subtle on a partial crypto (getRandomValues only, no subtle) while preserving its getRandomValues", () => {
    const nativeGetRandomValues = jest.fn();
    const target: any = { crypto: { getRandomValues: nativeGetRandomValues } };
    installWebCrypto(target);

    expect(target.crypto.subtle).toBeDefined();
    expect(typeof target.crypto.subtle.digest).toBe("function");
    expect(target.crypto.getRandomValues).toBe(nativeGetRandomValues);
  });
});
