// Unit tests for the push-dispatch helpers added in issue #9, plus the v2 sighting-copy helpers
// from issue #95 (title `<dish> is at <hall> today`, body leads with the meal period + until-when,
// per the canvas -- see PushAlerts.dc.html's mockup copy: "French Toast is at Franklin today" / "A
// favorite of yours is on the lunch menu — served until 2:30 PM."). Only the parts testable without
// a real network send: notification payload shape, dish->meal extraction, and the two
// invalid-token-detection functions (now in _shared/push.ts, re-exported here). Actual delivery (a
// real browser/device receiving a notification) is NOT covered here — see the PR description for
// what's verified vs. not.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/push.test.ts
// (see date.test.ts for why --node-modules-dir=none and --allow-env are both required.)
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { buildSightingNotification, extractDishMealMap, isPermanentWebPushError, findDeadExpoTokens } = await import("./index.ts");

Deno.test("buildSightingNotification: title names the dish and hall; body leads with meal + until-when", () => {
  const hours = { hallTid: 3, breakfast: null, lunch: { openTime: "11:00 AM", closeTime: "02:30 PM" }, dinner: null, general: null };
  const { title, body } = buildSightingNotification("French Toast", 3, "lunch", hours);
  if (title !== "French Toast is at Hampshire today") throw new Error(`unexpected title: ${title}`);
  if (body !== "A favorite of yours is on the lunch menu — served until 2:30 PM.") throw new Error(`unexpected body: ${body}`);
});

Deno.test("buildSightingNotification: unknown hall tid falls back instead of throwing", () => {
  const { title } = buildSightingNotification("Mystery Dish", 99, "dinner", undefined);
  if (title !== "Mystery Dish is at hall 99 today") throw new Error(`unexpected title: ${title}`);
});

Deno.test("buildSightingNotification: no hours data (or unmatched meal window) omits the until-when clause, not a guess", () => {
  const { body } = buildSightingNotification("Chicken Tenders", 3, "dinner", undefined);
  if (body !== "A favorite of yours is on the dinner menu today.") throw new Error(`unexpected body: ${body}`);
});

Deno.test("buildSightingNotification: latenight has no get_infov2 field, but still gets a readable meal label", () => {
  const { body } = buildSightingNotification("Late Night Nachos", 3, "latenight", undefined);
  if (body !== "A favorite of yours is on the late night menu today.") throw new Error(`unexpected body: ${body}`);
});

Deno.test("extractDishMealMap: a dish keeps the FIRST meal period it appears under", () => {
  const data = {
    breakfast: { "Hot Bar": '<li><a data-dish-name="French Toast"></a></li>' },
    lunch: {
      "Hot Bar": '<li><a data-dish-name="Chicken Tenders"></a></li>',
      // Same dish also under lunch's "Grill" category -- still counts as "lunch" (a dish can repeat
      // within one meal period's categories; that's not the case this test is about).
      "Grill": '<li><a data-dish-name="French Toast"></a></li>',
    },
  };
  const map = extractDishMealMap(data);
  if (map.get("French Toast") !== "breakfast") throw new Error(`expected French Toast -> breakfast, got ${map.get("French Toast")}`);
  if (map.get("Chicken Tenders") !== "lunch") throw new Error(`expected Chicken Tenders -> lunch, got ${map.get("Chicken Tenders")}`);
});

Deno.test("extractDishMealMap: decodes HTML entities in dish names", () => {
  const data = { dinner: { "Bakery": '<li><a data-dish-name="Mac &amp; Cheese"></a></li>' } };
  const map = extractDishMealMap(data);
  if (!map.has("Mac & Cheese")) throw new Error(`expected decoded "Mac & Cheese" as a key, got keys ${JSON.stringify([...map.keys()])}`);
});

// pr-reviewer finding (#145): favorited_foods stores dish names trimmed (shared/src/umassDining.ts's
// getAttrRaw does decode-then-trim), but this map was keyed on the untrimmed, decoded attribute --
// any dish whose live data-dish-name carries surrounding whitespace would silently fail to match
// (no sighting, no push, no error). Not reachable on a live probe (2026-08-23: 174 tags, 0 padded),
// but a latent parity trap between the two parsers.
Deno.test("extractDishMealMap: trims surrounding whitespace from data-dish-name, matching the shared parser", () => {
  const data = { breakfast: { "Hot Bar": '<li><a data-dish-name="  French Toast  "></a></li>' } };
  const map = extractDishMealMap(data);
  if (!map.has("French Toast")) throw new Error(`expected trimmed "French Toast" as a key, got keys ${JSON.stringify([...map.keys()])}`);
  if (map.has("  French Toast  ")) throw new Error("expected the padded, untrimmed key to be absent");
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
