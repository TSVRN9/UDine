// Red-first tests for send-ping-push's pure notification-copy builder (issue #95). Canvas mockup
// copy (PushAlerts.dc.html): title `Casey: "Let's go to Berkshire"`, body "Berkshire is open until
// 9:00 PM." -- the ping push "reuses the bubble message verbatim" (canvas note), but PING_MESSAGES
// (mobile/src/lib/pingGesture.ts) all end in a trailing "…" meant to trail into the hall name when
// displayed inline in the bubble ("Let's go to… Berkshire"); concatenated as a push title that reads
// as a literal double punctuation mark ("Let's go to… Berkshire" with the ellipsis kept is what
// "verbatim" superficially suggests, but the ONLY artifact that shows the assembled string is the
// mockup, and it shows the ellipsis trimmed) -- so the trailing ellipsis is stripped before
// concatenating with the hall name. "Verbatim" is about not inventing new copy, not about keeping a
// display-only trailing mark literally in a push notification.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/send-ping-push/push.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { buildPingNotification } = await import("./index.ts");

Deno.test("buildPingNotification: matches the canvas mockup exactly, ellipsis stripped from the message", () => {
  const { title, body } = buildPingNotification("Casey", "Let's go to…", 4, "9:00 PM");
  if (title !== 'Casey: "Let\'s go to Berkshire"') throw new Error(`unexpected title: ${title}`);
  if (body !== "Berkshire is open until 9:00 PM.") throw new Error(`unexpected body: ${body}`);
});

Deno.test("buildPingNotification: also strips an ASCII '...' trailing ellipsis, not just the unicode one", () => {
  const { title } = buildPingNotification("Casey", "Come to...", 1, null);
  if (title !== 'Casey: "Come to Worcester"') throw new Error(`unexpected title: ${title}`);
});

Deno.test("buildPingNotification: hall not currently open (or hours unavailable) omits the body -- no guessing", () => {
  const { body } = buildPingNotification("Casey", "Meet me at…", 2, null);
  if (body !== "") throw new Error(`expected an empty body when hours are unavailable, got ${JSON.stringify(body)}`);
});

Deno.test("buildPingNotification: blank/null message falls back to just the hall name, no empty quotes", () => {
  const blank = buildPingNotification("Casey", "", 3, null);
  if (blank.title !== "Casey: Hampshire") throw new Error(`unexpected title for blank message: ${blank.title}`);
  const nullMsg = buildPingNotification("Casey", null, 3, null);
  if (nullMsg.title !== "Casey: Hampshire") throw new Error(`unexpected title for null message: ${nullMsg.title}`);
});

Deno.test("buildPingNotification: unknown hall tid falls back instead of throwing", () => {
  const { title } = buildPingNotification("Casey", "Swing by…", 99, null);
  if (title !== 'Casey: "Swing by hall 99"') throw new Error(`unexpected title: ${title}`);
});

Deno.test("buildPingNotification: an absurdly long message is capped, not sent verbatim to Expo's batch API", () => {
  const longMessage = "x".repeat(500);
  const { title } = buildPingNotification("Casey", longMessage, 1, null);
  // "Casey: \"" + up to 100 chars + " Worcester\"" -- just needs to be well short of Expo's limits.
  if (title.length > 200) throw new Error(`expected the title to be capped, got length ${title.length}`);
});
