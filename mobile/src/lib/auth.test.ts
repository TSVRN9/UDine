// auth.ts pulls in ./supabase, which reads env vars createClient requires at import time and
// aren't set under jest. Stub it (and its network-facing neighbors) so signInWithGoogle's
// isSignInInFlight lifecycle is testable without a real network/browser.
jest.mock("./supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
    },
    from: jest.fn(),
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
import { isSignInInFlight, shouldExchangeCode, signInWithGoogle, signOut } from "./auth";
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

// #257: signOut() used to only call supabase.auth.signOut(), leaving this device's push_tokens
// row registered under the signing-out user -- the next person to use a shared device kept
// receiving the previous user's favorited-food alerts. The delete has to happen BEFORE
// auth.signOut() (RLS needs the still-live session to allow it) and must be best-effort (a failed
// delete shouldn't strand the user mid sign-out).
describe("signOut", () => {
  const getSession = supabase.auth.getSession as jest.Mock;
  const authSignOut = supabase.auth.signOut as jest.Mock;
  const from = supabase.from as jest.Mock;

  beforeEach(() => {
    getSession.mockReset();
    authSignOut.mockReset();
    from.mockReset();
  });

  /** Wires supabase.from("push_tokens").delete().eq(...).eq(...) to resolve with `result` and
   * records each call so tests can assert both the args and the call order relative to
   * auth.signOut(). */
  function mockPushTokensDelete(result: { error: unknown }, calls: string[]) {
    const eq2 = jest.fn().mockImplementation(() => {
      calls.push("push_tokens.delete");
      return Promise.resolve(result);
    });
    const eq1 = jest.fn().mockReturnValue({ eq: eq2 });
    const del = jest.fn().mockReturnValue({ eq: eq1 });
    from.mockReturnValue({ delete: del });
    return { del, eq1, eq2 };
  }

  it("deletes the signing-out user's Expo push_tokens row(s), before auth.signOut()", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    const calls: string[] = [];
    const { del, eq1, eq2 } = mockPushTokensDelete({ error: null }, calls);
    authSignOut.mockImplementation(() => {
      calls.push("auth.signOut");
      return Promise.resolve({ error: null });
    });

    await signOut();

    expect(from).toHaveBeenCalledWith("push_tokens");
    expect(del).toHaveBeenCalled();
    expect(eq1).toHaveBeenCalledWith("user_id", "user-1");
    expect(eq2).toHaveBeenCalledWith("platform", "expo");
    expect(calls).toEqual(["push_tokens.delete", "auth.signOut"]);
  });

  it("still completes sign-out even if the push_tokens delete fails", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
    mockPushTokensDelete({ error: new Error("delete boom") }, []);
    authSignOut.mockResolvedValue({ error: null });

    await expect(signOut()).resolves.toBeUndefined();
    expect(authSignOut).toHaveBeenCalled();
  });

  it("still completes sign-out even if reading the session itself throws", async () => {
    getSession.mockRejectedValue(new Error("getSession boom"));
    authSignOut.mockResolvedValue({ error: null });

    await expect(signOut()).resolves.toBeUndefined();
    expect(authSignOut).toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("skips the delete (nothing to clean up) and still signs out when there's no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    authSignOut.mockResolvedValue({ error: null });

    await signOut();

    expect(from).not.toHaveBeenCalled();
    expect(authSignOut).toHaveBeenCalled();
  });
});
