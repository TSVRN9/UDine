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

  it("wires crypto.getRandomValues to expo-crypto's getRandomValues", () => {
    const target: any = {};
    installWebCrypto(target);

    const arr = new Uint8Array(4);
    target.crypto.getRandomValues(arr);
    expect(getRandomValues).toHaveBeenCalledWith(arr);
  });

  it("does not clobber an already-present crypto global", () => {
    const existing = {};
    const target: any = { crypto: existing };
    installWebCrypto(target);
    expect(target.crypto).toBe(existing);
  });
});
