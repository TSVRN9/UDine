// auth.ts pulls in ./supabase, which reads env vars createClient requires at import time and
// aren't set under jest. Stub it (and its network-facing neighbors) so signInWithGoogle's
// isSignInInFlight lifecycle is testable without a real network/browser.
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock("expo-linking", () => ({
  createURL: jest.fn(() => "udine://redirect"),
  parse: jest.fn(),
}));

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { isSignInInFlight, shouldExchangeCode, signInWithGoogle } from "./auth";
import { supabase } from "./supabase";

const signInWithOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const exchangeCodeForSession = supabase.auth.exchangeCodeForSession as jest.Mock;
const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const linkingParse = Linking.parse as jest.Mock;

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

// isSignInInFlight is what redirect.tsx trusts to avoid double-exchanging a single-use code (#54).
// It has to be true for the whole browser round-trip and false again afterward on every exit path
// (success, dismiss, or an error before the browser even opens) — a `finally`, not a trailing
// clear that an early return or throw can skip.
describe("signInWithGoogle / isSignInInFlight", () => {
  beforeEach(() => {
    signInWithOAuth.mockReset();
    exchangeCodeForSession.mockReset();
    openAuthSessionAsync.mockReset();
    linkingParse.mockReset();
  });

  it("is true synchronously as soon as signInWithGoogle is called, and false again after a successful sign-in", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: "https://example.com/auth" }, error: null });
    openAuthSessionAsync.mockResolvedValue({ type: "success", url: "udine://redirect?code=abc123" });
    linkingParse.mockReturnValue({ queryParams: { code: "abc123" } });
    exchangeCodeForSession.mockResolvedValue({ error: null });

    expect(isSignInInFlight()).toBe(false);
    const promise = signInWithGoogle();
    // Must already be true before anything is awaited — catches the flag being set only after
    // the signInWithOAuth call instead of before it.
    expect(isSignInInFlight()).toBe(true);
    await promise;
    expect(isSignInInFlight()).toBe(false);
  });

  it("is false again after the user dismisses the browser (early return, no code to exchange)", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: "https://example.com/auth" }, error: null });
    openAuthSessionAsync.mockResolvedValue({ type: "dismiss" });

    await signInWithGoogle();
    expect(isSignInInFlight()).toBe(false);
  });

  it("is false again after signInWithOAuth itself rejects, before the browser ever opens", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error("boom") });

    await expect(signInWithGoogle()).rejects.toThrow("boom");
    expect(isSignInInFlight()).toBe(false);
  });
});
