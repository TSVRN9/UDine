// Shared-secret gate for the three server-only Edge Functions (check-favorited-foods,
// populate-dishes, send-ping-push). All three are deployed with verify_jwt = true, but that only
// requires *a* Supabase-signed JWT -- and the anon/publishable key is one, shipped in every app
// binary and web bundle. Confirmed live 2026-09-09: `curl -X POST .../functions/v1/send-ping-push
// -H "Authorization: Bearer <publishable key>"` returns 200 and runs the handler. None of the three
// ever looked at the caller beyond that, so anyone holding the public key could run the
// service-role cron bodies on demand: 4-5 upstream umassdining.com fetches + full-table scans +
// food_sightings upserts + push dispatch per call (check-favorited-foods), or a ~400-row upsert
// (populate-dishes) -- burning Edge invocations/egress and hammering umassdining.com from
// Supabase's egress IPs until the feature breaks for everyone.
//
// The fix keeps verify_jwt + the anon key exactly as the scheduling migrations chose (least
// privilege for the *cron's* credential) and adds a second factor the public key can't supply: an
// `x-udine-cron-secret` header, sent by the pg_cron jobs and the pings trigger from the
// `edge_cron_secret` Vault entry, checked here against the EDGE_CRON_SECRET function secret.
// Provisioning both is a one-time, out-of-band owner step -- see
// supabase/migrations/20260909200000_edge_cron_shared_secret.sql for the exact commands and the
// rollout order that avoids breaking the cron between steps.
//
// Fails CLOSED when EDGE_CRON_SECRET is unset (503, not a silent allow): a missing secret is a
// deployment mistake worth surfacing in the function logs, never a reason to reopen the surface.

export const CRON_SECRET_HEADER = "x-udine-cron-secret";

/** Length-then-XOR compare so a wrong guess can't be timed byte-by-byte. */
function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/** Returns a Response to send back (503 unconfigured / 403 wrong or missing header), or null when
 * the request carries the right secret and the handler should proceed. */
export function requireCronSecret(req: Request, expected: string | undefined = Deno.env.get("EDGE_CRON_SECRET")): Response | null {
  const json = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
  if (!expected) return json(503, "EDGE_CRON_SECRET is not configured for this function");
  const presented = req.headers.get(CRON_SECRET_HEADER) ?? "";
  if (!safeEqual(presented, expected)) return json(403, "forbidden");
  return null;
}
