// Red-first tests for dispatchPushNotifications's Expo dispatch (#197, #262).
//
// #197: the Expo POST was a single unchunked request -- Expo's API caps 100 messages/request, so a
// large sighting day (>100 expo tokens) made the whole POST fail, losing every Android push for the
// run. Fixed by chunking expoMessages into batches of 100, sent sequentially.
//
// #262: the Expo `fetch` + `res.json()` were unguarded (every other fetch in these functions was
// wrapped by #145). A rejected fetch/`.json()` threw out of dispatchPushNotifications -> the
// Deno.serve handler 500s AFTER index.ts already upserted food_sightings, so the next run's
// `ignoreDuplicates: true` skips them -- that hour's pushes are lost forever. Fixed by wrapping each
// chunk's POST + `.json()` in try/catch (mirrors fetchHallHours's shape): a failed chunk logs and is
// skipped, the rest of the chunks (and the function's return) proceed normally.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/_shared/push.dispatch.test.ts
// (--allow-env: push.ts imports npm:web-push at module top level -- see date.test.ts's comment.)

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { dispatchPushNotifications, type PushConfig, type PushNotification } from "./push.ts";

// Minimal fake Supabase client: `.from("push_tokens").select(...).in(...)` resolves to the given
// tokenRows; `.from("push_tokens").delete().eq(...).eq(...)` records the deleted token and resolves.
function fakeSupabase(tokenRows: { user_id: string; platform: string; token: string }[], deletedTokens: string[]): SupabaseClient {
  const client = {
    from(_table: string) {
      const chain: Record<string, unknown> = {
        select() {
          return chain;
        },
        in() {
          return Promise.resolve({ data: tokenRows, error: null });
        },
        delete() {
          return chain;
        },
        eq(col: string, val: string) {
          if (col === "token") deletedTokens.push(val);
          return chain;
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return chain;
    },
  };
  return client as unknown as SupabaseClient;
}

function expoConfig(): PushConfig {
  return { webPushConfigured: false, expoPushConfigured: true, expoAccessToken: "test-token" };
}

function tokensAndNotifications(count: number) {
  const tokenRows = Array.from({ length: count }, (_, i) => ({ user_id: `user-${i}`, platform: "expo", token: `ExponentPushToken[${i}]` }));
  const notifications: PushNotification[] = tokenRows.map((r) => ({ userId: r.user_id, title: "t", body: "b" }));
  return { tokenRows, notifications };
}

Deno.test("dispatchPushNotifications: 250 Expo messages are chunked into 100/100/50 POSTs, all consumed", async () => {
  const { tokenRows, notifications } = tokensAndNotifications(250);
  const chunkSizes: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((async (_url: string, init: RequestInit) => {
    const messages = JSON.parse(init.body as string) as unknown[];
    chunkSizes.push(messages.length);
    return {
      ok: true,
      json: async () => ({ data: messages.map(() => ({ status: "ok" })) }),
    } as unknown as Response;
  }) as unknown) as typeof fetch;

  try {
    const deleted: string[] = [];
    const result = await dispatchPushNotifications(fakeSupabase(tokenRows, deleted), notifications, expoConfig());
    if (chunkSizes.length !== 3) throw new Error(`expected 3 POSTs, got ${chunkSizes.length}`);
    if (chunkSizes[0] !== 100 || chunkSizes[1] !== 100 || chunkSizes[2] !== 50) {
      throw new Error(`expected chunk sizes [100,100,50], got ${JSON.stringify(chunkSizes)}`);
    }
    if (result.pushSent !== 250) throw new Error(`expected pushSent 250 (all chunks consumed), got ${result.pushSent}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("dispatchPushNotifications: a rejected fetch on one chunk doesn't abort the others or throw out of the function", async () => {
  const { tokenRows, notifications } = tokensAndNotifications(250);
  let callCount = 0;
  const chunkSizes: number[] = [];
  const errors: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  globalThis.fetch = ((async (_url: string, init: RequestInit) => {
    callCount++;
    const messages = JSON.parse(init.body as string) as unknown[];
    if (callCount === 2) throw new TypeError("network error");
    chunkSizes.push(messages.length);
    return {
      ok: true,
      json: async () => ({ data: messages.map(() => ({ status: "ok" })) }),
    } as unknown as Response;
  }) as unknown) as typeof fetch;

  try {
    const deleted: string[] = [];
    const result = await dispatchPushNotifications(fakeSupabase(tokenRows, deleted), notifications, expoConfig());
    if (callCount !== 3) throw new Error(`expected all 3 chunks attempted, got ${callCount} fetch calls`);
    // chunks 1 and 3 (100 + 50) succeeded and are the only ones recorded in chunkSizes (chunk 2
    // throws before pushing); this is what proves "chunks 1 and 3 still sent", not just their count.
    if (chunkSizes.length !== 2 || chunkSizes[0] !== 100 || chunkSizes[1] !== 50) {
      throw new Error(`expected chunks 1 and 3 (sizes [100,50]) to have succeeded, got ${JSON.stringify(chunkSizes)}`);
    }
    if (result.pushSent !== 150) throw new Error(`expected pushSent 150 (chunks 1+3 only), got ${result.pushSent}`);
    if (errors.length === 0) throw new Error("expected the chunk 2 failure to be logged via console.error");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

Deno.test("dispatchPushNotifications: res.json() throwing on one chunk doesn't abort the others or throw out of the function", async () => {
  const { tokenRows, notifications } = tokensAndNotifications(250);
  let callCount = 0;
  const errors: unknown[] = [];
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  globalThis.fetch = ((async (_url: string, init: RequestInit) => {
    callCount++;
    const messages = JSON.parse(init.body as string) as unknown[];
    if (callCount === 2) {
      return {
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token in JSON");
        },
      } as unknown as Response;
    }
    return {
      ok: true,
      json: async () => ({ data: messages.map(() => ({ status: "ok" })) }),
    } as unknown as Response;
  }) as unknown) as typeof fetch;

  try {
    const deleted: string[] = [];
    const result = await dispatchPushNotifications(fakeSupabase(tokenRows, deleted), notifications, expoConfig());
    if (callCount !== 3) throw new Error(`expected all 3 chunks attempted, got ${callCount} fetch calls`);
    if (result.pushSent !== 150) throw new Error(`expected pushSent 150 (chunks 1+3 only), got ${result.pushSent}`);
    if (errors.length === 0) throw new Error("expected the chunk 2 .json() failure to be logged via console.error");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});

Deno.test("dispatchPushNotifications: dead-token deletion still works when messages span multiple chunks", async () => {
  const { tokenRows, notifications } = tokensAndNotifications(150);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((async (_url: string, init: RequestInit) => {
    const messages = JSON.parse(init.body as string) as { to: string }[];
    // First token of each chunk reports as permanently dead.
    const receipts = messages.map((_m, i) => (i === 0 ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok" }));
    return { ok: true, json: async () => ({ data: receipts }) } as unknown as Response;
  }) as unknown) as typeof fetch;

  try {
    const deleted: string[] = [];
    const result = await dispatchPushNotifications(fakeSupabase(tokenRows, deleted), notifications, expoConfig());
    if (deleted.length !== 2) throw new Error(`expected 2 dead tokens deleted (one per chunk), got ${JSON.stringify(deleted)}`);
    if (deleted[0] !== "ExponentPushToken[0]" || deleted[1] !== "ExponentPushToken[100]") {
      throw new Error(`expected chunk-0's and chunk-100's first token dead, got ${JSON.stringify(deleted)}`);
    }
    if (result.tokensRemoved !== 2) throw new Error(`expected tokensRemoved 2, got ${result.tokensRemoved}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
