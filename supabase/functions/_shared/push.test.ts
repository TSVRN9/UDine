// Red-first tests for isKnownPushServiceHost (pr-reviewer finding, #145) -- push_tokens has no
// server-side write path, so RLS lets an authenticated user upsert their own row with an arbitrary
// Web Push `endpoint`. Without this check, dispatchPushNotifications (in this same module) would POST
// a VAPID-signed request to whatever host they chose: a blind, self-triggered SSRF primitive. See
// this file's sibling push.ts for the allowlist and where it's wired into the send path.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/_shared/push.test.ts
// (--allow-env: push.ts imports npm:web-push at module top level, which transitively reads an env
// var at import time -- see check-favorited-foods/date.test.ts's comment for the full explanation.)

import { isKnownPushServiceHost } from "./push.ts";

Deno.test("isKnownPushServiceHost: accepts the four known push services, including subdomains", () => {
  const allowed = [
    "https://fcm.googleapis.com/fcm/send/abc123",
    "https://updates.push.services.mozilla.com/wpush/v2/xyz",
    "https://xxx.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QAA...",
    "https://googleapis.com/",
    "https://mozilla.com/",
  ];
  for (const endpoint of allowed) {
    if (!isKnownPushServiceHost(endpoint)) throw new Error(`expected ${endpoint} to be allowed`);
  }
});

Deno.test("isKnownPushServiceHost: rejects an arbitrary/attacker-controlled host", () => {
  const rejected = [
    "http://169.254.169.254/latest/meta-data/",
    "https://internal.corp.example/admin",
    "https://evil.com/",
  ];
  for (const endpoint of rejected) {
    if (isKnownPushServiceHost(endpoint)) throw new Error(`expected ${endpoint} to be rejected`);
  }
});

Deno.test("isKnownPushServiceHost: rejects a lookalike host that merely contains the allowlisted suffix", () => {
  // No "." immediately before the suffix -- "evilgoogleapis.com" is a different, unrelated domain,
  // not a subdomain of googleapis.com.
  if (isKnownPushServiceHost("https://evilgoogleapis.com/fcm/send/abc")) {
    throw new Error("expected evilgoogleapis.com to be rejected (not a real googleapis.com subdomain)");
  }
});

Deno.test("isKnownPushServiceHost: rejects a malformed URL instead of throwing", () => {
  if (isKnownPushServiceHost("not-a-url")) throw new Error("expected a malformed URL to be rejected");
});
