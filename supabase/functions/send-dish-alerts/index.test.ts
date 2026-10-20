// Run (repo root): deno test --node-modules-dir=none --allow-env --allow-read=shared/vectors supabase/functions/send-dish-alerts
// Every network call goes through a fake fetch; the service-account key is generated here and signs nothing real.
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;
const { runSendDishAlerts, handle } = await import("./index.ts");
import { dishTopic } from "../_shared/dishTopic.ts";

const EIGHT_AM = new Date("2026-10-20T12:00:00Z"); // 8:00 EDT
const SIX_AM = new Date("2026-10-20T10:00:00Z");
const NINE_AM = new Date("2026-10-20T13:00:00Z");
const DAY = "2026-10-20";

const pem = async () => {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  return `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
};
const SA = JSON.stringify({ client_email: "fake@fake.iam.gserviceaccount.com", private_key: await pem() });
const TOKEN = "fake-access-token-xyz";

const html = (...names: string[]) => names.map((n) => `<a data-dish-name="${n}">`).join("");
const info = [1, 2, 3, 4].map((i) => ({
  location_title: ["", "Worcester", "Franklin", "Hampshire", "Berkshire"][i] + " Commons",
  opening_hours: "7:00 AM", closing_hours: "9:00 PM",
  breakfast_open_time: "7:00 AM", breakfast_close_time: "7:30 AM",
  lunch_open_time: "11:00 AM", lunch_close_time: "4:30 PM",
}));

type Menus = Record<number, Record<string, Record<string, string>>>;
function world(menus: Menus, fcmStatus: (n: number) => number = () => 200) {
  const sent: any[] = [], log: string[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    log.push(url);
    if (url.includes("foodpro-menu-ajax")) return Response.json(menus[Number(new URL(url).searchParams.get("tid"))] ?? {});
    if (url.includes("get_infov2")) return Response.json(info);
    if (url.includes("oauth2.googleapis.com/token")) {
      const body = new URLSearchParams(String(init?.body));
      if (body.get("grant_type") !== "urn:ietf:params:oauth:grant-type:jwt-bearer" || body.get("assertion")?.split(".").length !== 3) return new Response("bad", { status: 400 });
      return Response.json({ access_token: TOKEN, expires_in: 3600 });
    }
    if (url.includes("fcm.googleapis.com/v1/projects/proj-1/messages:send")) {
      if ((init?.headers as Record<string, string>).Authorization !== `Bearer ${TOKEN}`) return new Response("unauth", { status: 401 });
      const msg = JSON.parse(String(init?.body)).message;
      sent.push(msg);
      return new Response("{}", { status: fcmStatus(sent.length) });
    }
    return new Response("unexpected " + url, { status: 500 });
  }) as typeof fetch;
  const claims = new Set<string>(), released: string[] = [];
  let swept: string | null = null;
  const db = {
    claim: (k: string, d: string) => { const id = `${k}|${d}`; if (claims.has(id)) return Promise.resolve(false); claims.add(id); return Promise.resolve(true); },
    release: (k: string, d: string) => { claims.delete(`${k}|${d}`); released.push(k); return Promise.resolve(); },
    sweep: (d: string) => { swept = d; return Promise.resolve(); },
  };
  const run = (now: Date, test?: { dish: string }) => runSendDishAlerts({ now, fetchImpl, db, serviceAccountJson: SA, projectId: "proj-1", test });
  return { sent, log, claims, released, run, db, fetchImpl, swept: () => swept };
}
const count = (x: { length?: number; size?: number }) => x.length ?? x.size;
const lunch = (...n: string[]) => ({ lunch: { Entrees: html(...n) } });

Deno.test("matches menus to topics and builds the where body; one per dish across halls", async () => {
  const w = world({ 1: lunch("Pizza", "Soup"), 4: lunch("Pizza") });
  await w.run(EIGHT_AM);
  const topics = w.sent.map((m) => m.topic).sort();
  if (JSON.stringify(topics) !== JSON.stringify([dishTopic("Pizza"), dishTopic("Soup")].sort())) throw new Error(JSON.stringify(topics));
  const pizza = w.sent.find((m) => m.topic === dishTopic("Pizza"));
  if (pizza.notification.title !== "Pizza" || pizza.notification.body !== "Lunch from 11 AM, at Worcester and Berkshire") throw new Error(JSON.stringify(pizza));
  if (pizza.android.priority !== "HIGH" || pizza.android.notification.channel_id !== "favorite_alerts" || pizza.android.notification.tag !== `${dishTopic("Pizza")}-${DAY}`) throw new Error(JSON.stringify(pizza.android));
  if (pizza.data.route !== "/halls") throw new Error("route");
  if (pizza.apns.headers["apns-collapse-id"] !== pizza.android.notification.tag || pizza.apns.headers["apns-priority"] !== "10" || pizza.apns.payload.aps.sound !== "default") throw new Error(JSON.stringify(pizza.apns));
});

Deno.test("a run before 7 AM or from 9 AM Eastern posts nothing and fetches nothing", async () => {
  for (const t of [SIX_AM, NINE_AM]) {
    const w = world({ 1: lunch("Pizza") });
    await w.run(t);
    if (w.sent.length || w.log.length) throw new Error("posted or fetched outside the window");
  }
});

Deno.test("a second run the same day posts nothing", async () => {
  const w = world({ 1: lunch("Pizza") });
  await w.run(EIGHT_AM);
  await w.run(EIGHT_AM);
  if (w.sent.length !== 1) throw new Error(`sent ${w.sent.length}`);
});

Deno.test("a failed FCM call releases the claim, and the next run sends it", async () => {
  const w = world({ 1: lunch("Pizza") }, (n) => (n === 1 ? 503 : 200));
  await w.run(EIGHT_AM);
  if (w.released.length !== 1 || w.claims.size !== 0) throw new Error("claim not released");
  await w.run(EIGHT_AM);
  if (count(w.sent) !== 2 || count(w.claims) !== 1) throw new Error("not retried");
});

Deno.test("a dish whose last serving ended posts nothing, and the claim is never taken", async () => {
  const w = world({ 1: { breakfast: { E: html("Omelette") } } });
  await w.run(EIGHT_AM);
  if (w.sent.length || w.claims.size) throw new Error("posted an ended dish");
});

Deno.test("old claims are swept at the end of a real run", async () => {
  const w = world({ 1: lunch("Pizza") });
  await w.run(EIGHT_AM);
  if (w.swept() !== "2026-10-17") throw new Error(String(w.swept()));
});

Deno.test("test hook sends one dish now, skipping gate and claim", async () => {
  const w = world({ 1: lunch("Pizza", "Soup") });
  await w.run(SIX_AM, { dish: "Pizza" });
  if (w.sent.length !== 1 || w.sent[0].topic !== dishTopic("Pizza") || w.sent[0].android.priority !== "HIGH") throw new Error(JSON.stringify(w.sent));
  if (w.claims.size || w.swept()) throw new Error("test hook touched dish_alerts_sent");
  await w.run(SIX_AM, { dish: "Pizza" });
  if (count(w.sent) !== 2) throw new Error("second test send was blocked");
});

Deno.test("handle refuses without the cron secret and never logs the key or token", async () => {
  const logs: string[] = [];
  const orig = [console.log, console.error];
  console.log = console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  try {
    const w = world({ 1: lunch("Pizza") }, () => 500);
    const env = { EDGE_CRON_SECRET: "s3cret", FCM_SERVICE_ACCOUNT_JSON: SA, FCM_PROJECT_ID: "proj-1" };
    const req = (h: Record<string, string>) => new Request("http://x", { method: "POST", headers: h, body: JSON.stringify({ test: { dish: "Pizza" } }) });
    const deps = { env, db: w.db, fetchImpl: w.fetchImpl, now: SIX_AM };
    const refused = await handle(req({}), deps);
    if (refused.status !== 403 || w.log.length) throw new Error(`status ${refused.status}`);
    const failed = await handle(req({ "x-udine-cron-secret": "s3cret" }), deps); // FCM answers 500: the failure path logs
    if (failed.status !== 200 || w.sent.length !== 1) throw new Error("hook did not reach FCM");
  } finally {
    [console.log, console.error] = orig;
  }
  const all = logs.join("\n");
  if (all.includes("PRIVATE KEY") || all.includes(TOKEN) || all.includes("fake@fake")) throw new Error("secret logged");
});
