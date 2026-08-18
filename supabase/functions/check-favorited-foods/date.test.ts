// Standalone verification for the US/Eastern date fix (issue #3) — no test runner is configured
// for supabase/functions, so this is run directly with `deno test`.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/check-favorited-foods/date.test.ts
// (--node-modules-dir=none is required: without it, plain `deno test` in this repo detects the
// pnpm-workspace.yaml and silently migrates it into a "workspaces" key in package.json.
// --allow-env is required as of issue #9: index.ts now imports npm:web-push at module top level,
// and one of its transitive deps (http_ece) reads process.env.ECE_KEYLOG at import time — that's
// enough to trip Deno's permission check even though this test never calls any push code. Not an
// issue in the deployed Edge Function, which runs with full env/net access already.)
//
// index.ts calls Deno.serve(...) at module top-level (it's an Edge Function entrypoint), which
// would try to bind a listener on import. Stub it out to a no-op before importing so this stays a
// pure unit test with no --allow-net needed for that call.
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { todayDateParam, todayIsoDate } = await import("./index.ts");

/** Temporarily makes `new Date()` (no args) resolve to a fixed instant, then restores it. */
function withFixedNow(iso: string, fn: () => void) {
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor() {
      super(iso);
    }
    static override now() {
      return new RealDate(iso).getTime();
    }
  }
  // deno-lint-ignore no-explicit-any
  globalThis.Date = FixedDate as any;
  try {
    fn();
  } finally {
    globalThis.Date = RealDate;
  }
}

Deno.test("todayIsoDate/todayDateParam use Eastern date when UTC has already rolled to the next day", () => {
  // 2026-01-15T02:00:00Z = 2026-01-14 21:00 EST — different calendar day in UTC vs Eastern.
  withFixedNow("2026-01-15T02:00:00.000Z", () => {
    if (todayIsoDate() !== "2026-01-14") {
      throw new Error(`expected Eastern date 2026-01-14, got ${todayIsoDate()}`);
    }
    if (todayDateParam() !== "01/14/2026") {
      throw new Error(`expected Eastern date 01/14/2026, got ${todayDateParam()}`);
    }
  });
});

Deno.test("todayIsoDate/todayDateParam agree with UTC when both fall on the same calendar day", () => {
  // 2026-01-15T15:00:00Z = 2026-01-15 10:00 EST — same calendar day in UTC and Eastern.
  withFixedNow("2026-01-15T15:00:00.000Z", () => {
    if (todayIsoDate() !== "2026-01-15") {
      throw new Error(`expected 2026-01-15, got ${todayIsoDate()}`);
    }
    if (todayDateParam() !== "01/15/2026") {
      throw new Error(`expected 01/15/2026, got ${todayDateParam()}`);
    }
  });
});

Deno.test("EDT (summer, UTC-4): 2026-07-01T02:00:00Z is still 2026-06-30 evening Eastern", () => {
  withFixedNow("2026-07-01T02:00:00.000Z", () => {
    if (todayIsoDate() !== "2026-06-30") {
      throw new Error(`expected 2026-06-30, got ${todayIsoDate()}`);
    }
    if (todayDateParam() !== "06/30/2026") {
      throw new Error(`expected 06/30/2026, got ${todayDateParam()}`);
    }
  });
});
