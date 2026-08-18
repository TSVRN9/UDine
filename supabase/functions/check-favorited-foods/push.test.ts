// Unit tests for the push-dispatch helpers added in issue #9 — only the parts testable without a
// real network send: notification payload shape, and the two invalid-token-detection functions
// (Web Push's thrown-error shape, Expo's per-token receipt array). Actual delivery (a real
// browser/device receiving a notification) is NOT covered here — see the PR description for what's
// verified vs. not.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/push.test.ts
// (see date.test.ts for why --node-modules-dir=none and --allow-env are both required.)
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { buildSightingNotification, isPermanentWebPushError, findDeadExpoTokens } = await import("./index.ts");

Deno.test("buildSightingNotification: known hall gets its name", () => {
  const { title, body } = buildSightingNotification("Chicken Tikka Masala", 3);
  if (title !== "Spotted: Chicken Tikka Masala") throw new Error(`unexpected title: ${title}`);
  if (body !== "at Hampshire today") throw new Error(`unexpected body: ${body}`);
});

Deno.test("buildSightingNotification: unknown hall tid falls back instead of throwing", () => {
  const { body } = buildSightingNotification("Mystery Dish", 99);
  if (body !== "at hall 99 today") throw new Error(`unexpected body: ${body}`);
});

Deno.test("isPermanentWebPushError: 404/410 are permanent", () => {
  if (!isPermanentWebPushError({ statusCode: 404 })) throw new Error("expected 404 to be permanent");
  if (!isPermanentWebPushError({ statusCode: 410 })) throw new Error("expected 410 to be permanent");
});

Deno.test("isPermanentWebPushError: rate limits/5xx/malformed errors are not permanent", () => {
  if (isPermanentWebPushError({ statusCode: 429 })) throw new Error("429 should not be permanent");
  if (isPermanentWebPushError({ statusCode: 500 })) throw new Error("500 should not be permanent");
  if (isPermanentWebPushError(new Error("network blip"))) throw new Error("plain Error should not be permanent");
  if (isPermanentWebPushError(null)) throw new Error("null should not be permanent");
});

Deno.test("findDeadExpoTokens: picks out only DeviceNotRegistered entries, by position", () => {
  const tokens = ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]"];
  const receipts = [
    { status: "ok" as const },
    { status: "error" as const, details: { error: "DeviceNotRegistered" } },
    { status: "error" as const, details: { error: "MessageTooBig" } },
  ];
  const dead = findDeadExpoTokens(tokens, receipts);
  if (dead.length !== 1 || dead[0] !== "ExponentPushToken[b]") {
    throw new Error(`expected only token b dead, got ${JSON.stringify(dead)}`);
  }
});

Deno.test("findDeadExpoTokens: empty/all-ok input yields nothing", () => {
  const dead = findDeadExpoTokens(["t1", "t2"], [{ status: "ok" }, { status: "ok" }]);
  if (dead.length !== 0) throw new Error(`expected no dead tokens, got ${JSON.stringify(dead)}`);
});
