// Red-first tests for requireCronSecret -- the gate that stops the public anon/publishable key
// (which passes verify_jwt on its own) from invoking the three server-only functions. Written
// against the pre-fix handlers first: every function returned 200 for a bare publishable-key
// request (live-confirmed against send-ping-push), i.e. the "no header -> 403" case below had no
// code to make it pass.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/_shared/cronAuth.test.ts

import { CRON_SECRET_HEADER, requireCronSecret } from "./cronAuth.ts";

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.supabase.co/functions/v1/populate-dishes", { method: "POST", headers });
}

Deno.test("requireCronSecret: no EDGE_CRON_SECRET configured fails closed with 503, never allows", () => {
  const res = requireCronSecret(request({ [CRON_SECRET_HEADER]: "anything" }), undefined);
  if (!res || res.status !== 503) throw new Error(`expected 503 when unconfigured, got ${res?.status}`);
});

Deno.test("requireCronSecret: request with no secret header (a bare anon-key call) is 403", () => {
  const res = requireCronSecret(request(), "s3cret");
  if (!res || res.status !== 403) throw new Error(`expected 403 with no header, got ${res?.status}`);
});

Deno.test("requireCronSecret: wrong secret is 403 -- including a same-length near-miss", () => {
  for (const bad of ["wrong", "s3cres", "s3crex", "S3CRET"]) {
    const res = requireCronSecret(request({ [CRON_SECRET_HEADER]: bad }), "s3cret");
    if (!res || res.status !== 403) throw new Error(`expected 403 for ${JSON.stringify(bad)}, got ${res?.status}`);
  }
});

Deno.test("requireCronSecret: matching secret returns null so the handler proceeds", () => {
  const res = requireCronSecret(request({ [CRON_SECRET_HEADER]: "s3cret" }), "s3cret");
  if (res !== null) throw new Error(`expected null (allowed), got status ${res.status}`);
});

Deno.test("requireCronSecret: defaults to reading EDGE_CRON_SECRET from the environment", () => {
  Deno.env.set("EDGE_CRON_SECRET", "from-env");
  try {
    if (requireCronSecret(request({ [CRON_SECRET_HEADER]: "from-env" })) !== null) throw new Error("expected env-backed match to allow");
    if (requireCronSecret(request({ [CRON_SECRET_HEADER]: "nope" }))?.status !== 403) throw new Error("expected env-backed mismatch to 403");
  } finally {
    Deno.env.delete("EDGE_CRON_SECRET");
  }
});
