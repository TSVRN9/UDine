// Posts one visible FCM notification per favourited-dish topic per day (docs/briefs/flutter-port-alert-push.md). The server never
// knows who follows what: it posts to `dish-<hash>` for every dish on today's menus, and each install follows only its own.
// pg_cron fires at 11:00 and 12:00 UTC; the function itself only sends from 7:00 to 9:00 AM Eastern. Claim/release through
// dish_alerts_sent: a dish is claimed before the send, and a failed send gives the claim back for the next run.
// Body `{"test": {"dish": "<name>"}}` (behind the cron secret) sends that one dish now, skipping the gate and the claim.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/cronAuth.ts";
import { dishTopic } from "../_shared/dishTopic.ts";
import { fetchHallHours, hallName, HALL_TIDS } from "../_shared/hours.ts";
import { mintAccessToken, sendToTopic } from "../_shared/fcm.ts";
import { type Board, whenText, wherePlan, type WhereGroup } from "../_shared/where.ts";

export interface ClaimDb {
  claim(dishKey: string, day: string): Promise<boolean>;
  release(dishKey: string, day: string): Promise<void>;
  sweep(before: string): Promise<void>;
}

const PLACE_TID: Record<string, number> = { W: 1, F: 2, H: 3, B: 4 };
const MEAL_OF: Record<string, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", "late night": "late", latenight: "late" };
const CONCURRENCY = 8;

const easternParts = (now: Date) => {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", hour: "numeric" }).format(now));
  return { iso, hour };
};
const daysBefore = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const names = (n: string[]) => (n.length < 2 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`);
const decode = (s: string) => s.replace(/&(amp|#039|quot|lt|gt);/g, (m) => ({ "&amp;": "&", "&#039;": "'", "&quot;": '"', "&lt;": "<", "&gt;": ">" })[m]!);

/** meal -> dish names for one hall, from the raw foodpro-menu-ajax response; any failure is an empty hall. */
async function fetchMeals(tid: number, mdy: string, fetchImpl: typeof fetch): Promise<Record<string, string[]>> {
  try {
    const res = await fetchImpl(`https://www.umassdining.com/foodpro-menu-ajax?tid=${tid}&date=${encodeURIComponent(mdy)}`);
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, Record<string, string> | undefined>;
    const out: Record<string, string[]> = {};
    for (const [period, cats] of Object.entries(data)) {
      const meal = MEAL_OF[period.toLowerCase()];
      if (!meal) continue;
      for (const html of Object.values(cats ?? {})) {
        if (typeof html !== "string") continue; // one bad category drops only itself
        for (const m of html.matchAll(/data-dish-name="([^"]*)"/g)) (out[meal] ??= []).push(decode(m[1]).trim());
      }
    }
    return out;
  } catch {
    console.error(`menu fetch failed for tid ${tid}`);
    return {};
  }
}

const bodyOf = (plan: WhereGroup[]) =>
  plan.map((g, i) => `${whenText(g, i > 0 ? plan[i - 1] : undefined)}, at ${names(g.halls.map((h) => hallName(PLACE_TID[h])))}`).join("\n");

export async function runSendDishAlerts(o: {
  now: Date; fetchImpl: typeof fetch; db: ClaimDb; serviceAccountJson: string; projectId: string; test?: { dish: string };
}) {
  const { iso, hour } = easternParts(o.now);
  if (!o.test && (hour < 7 || hour >= 9)) return { skipped: "outside 7-9 AM Eastern", sent: 0 };

  const [y, m, d] = iso.split("-");
  const [hours, ...menus] = await Promise.all([fetchHallHours(o.fetchImpl), ...HALL_TIDS.map((t) => fetchMeals(t, `${m}/${d}/${y}`, o.fetchImpl))]);
  const board: Board = { places: [], hours: {}, grab: {}, days: { [iso]: {} } };
  Object.entries(PLACE_TID).forEach(([place, tid], i) => {
    const h = hours.get(tid);
    if (!h) return;
    board.places.push({ key: place, area: 0 });
    board.hours[place] = h;
    board.days[iso][place] = menus[i];
  });

  const dishes = new Map<string, string>(); // topic -> first name seen
  for (const meals of menus) for (const list of Object.values(meals)) for (const n of list) if (!dishes.has(dishTopic(n))) dishes.set(dishTopic(n), n);
  if (o.test) dishes.set(dishTopic(o.test.dish), o.test.dish);

  const due: { topic: string; title: string; body: string }[] = [];
  for (const [topic, name] of dishes) {
    if (o.test && name !== o.test.dish) continue;
    const plan = wherePlan(board, name, o.now).filter((g) => g.day === 0);
    // A hook dish with nothing left today still sends, so the device run checks the message shape.
    if (plan.length || o.test) due.push({ topic, title: name, body: plan.length ? bodyOf(plan) : "Not on today's menu" });
  }
  if (!due.length) return { sent: 0, due: 0 };

  const token = await mintAccessToken(o.serviceAccountJson, o.fetchImpl);
  let sent = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < due.length) {
      const a = due[next++];
      if (!o.test && !(await o.db.claim(a.topic, iso))) continue;
      if (await sendToTopic(o.projectId, token, { ...a, tag: `${a.topic}-${iso}` }, o.fetchImpl)) sent++;
      else {
        failed++;
        if (!o.test) await o.db.release(a.topic, iso);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (!o.test) await o.db.sweep(daysBefore(iso, 3));
  return { sent, failed, due: due.length };
}

const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export async function handle(
  req: Request,
  deps: { env: Record<string, string | undefined>; db: ClaimDb; fetchImpl?: typeof fetch; now?: Date },
): Promise<Response> {
  const denied = requireCronSecret(req, deps.env.EDGE_CRON_SECRET);
  if (denied) return denied;
  const serviceAccountJson = deps.env.FCM_SERVICE_ACCOUNT_JSON, projectId = deps.env.FCM_PROJECT_ID;
  if (!serviceAccountJson || !projectId) return json(503, { error: "FCM is not configured for this function" });
  const body = await req.json().catch(() => ({}));
  const dish = typeof body?.test?.dish === "string" ? body.test.dish : undefined;
  try {
    const r = await runSendDishAlerts({
      now: deps.now ?? new Date(), fetchImpl: deps.fetchImpl ?? fetch, db: deps.db, serviceAccountJson, projectId, test: dish ? { dish } : undefined,
    });
    return json(200, r);
  } catch {
    console.error("send-dish-alerts run failed"); // never e.message: a bad service-account secret can echo into it
    return json(500, { error: "send failed" });
  }
}

Deno.serve((req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const t = () => sb.from("dish_alerts_sent");
  const db: ClaimDb = {
    claim: async (dish_key, day) => {
      const { data, error } = await t().upsert({ dish_key, day }, { onConflict: "dish_key,day", ignoreDuplicates: true }).select("dish_key");
      return !error && (data?.length ?? 0) > 0;
    },
    release: async (dish_key, day) => {
      const { error } = await t().delete().eq("dish_key", dish_key).eq("day", day);
      if (error) console.error(`dish_alerts_sent release failed: ${error.code ?? ""} ${error.message}`);
    },
    sweep: async (before) => void (await t().delete().lt("day", before)),
  };
  return handle(req, { env: Deno.env.toObject(), db });
});
