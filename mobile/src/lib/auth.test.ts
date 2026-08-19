// auth.ts pulls in ./supabase, which reads env vars createClient requires at import time and
// aren't set under jest. shouldExchangeCode never touches supabase, so a stub is enough.
jest.mock("./supabase", () => ({ supabase: {} }));

import { shouldExchangeCode } from "./auth";

// #54: cold-started OAuth deep links land in redirect.tsx with no signInWithGoogle() in flight to
// consume the code. This is the pure "should redirect.tsx exchange this code itself" decision that
// gates that, isolated from supabase/Linking so it's testable without mocking either.
describe("shouldExchangeCode", () => {
  it("is true for a real code when no sign-in is in flight (cold start)", () => {
    expect(shouldExchangeCode("a-code", false)).toBe(true);
  });

  it("is false when a sign-in is already in flight (warm path handles it, code is single-use)", () => {
    expect(shouldExchangeCode("a-code", true)).toBe(false);
  });

  it("is false when there's no code at all", () => {
    expect(shouldExchangeCode(undefined, false)).toBe(false);
  });

  it("is false for a non-string code (e.g. Router gives an array for a repeated param)", () => {
    expect(shouldExchangeCode(["a-code", "b-code"], false)).toBe(false);
  });
});
