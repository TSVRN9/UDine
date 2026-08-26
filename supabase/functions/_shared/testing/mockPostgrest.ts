// A minimal in-memory PostgREST stand-in for issue #261's pagination/chunking tests. Deliberately
// tiny -- only understands `select`, `eq.`, `in.(...)`, and `offset`/`limit` (what `.range()`
// actually sends -- see @supabase/postgrest-js's PostgrestTransformBuilder.range(), which sets
// `offset`/`limit` query params, not a Range header). Two behaviors matter here, both taken straight
// from the issue's own live repro against local PostgREST:
//   1. A response is capped at `maxRowsPerResponse` (config.toml's max_rows = 1000) regardless of
//      what `limit` asked for -- PostgREST doesn't error on this, it just silently truncates.
//   2. A request whose full URL exceeds `maxUrlLength` gets back a real 414, mirroring the 414 a
//      ~300-uuid `.in()` filter (an 11,189-byte URL) got in the issue's repro.
export type MockRow = Record<string, unknown>;

export function makeMockPostgrest(tables: Record<string, MockRow[]>, opts: { maxUrlLength?: number; maxRowsPerResponse?: number } = {}) {
  const maxUrlLength = opts.maxUrlLength ?? 8000; // typical proxy default (nginx) -- comfortably under the issue's 11,189-byte 414
  const maxRowsPerResponse = opts.maxRowsPerResponse ?? 1000; // matches config.toml's max_rows
  const requestUrls: URL[] = [];

  const fetchImpl = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.toString().length > maxUrlLength) {
      return new Response("URI Too Long", { status: 414 });
    }
    requestUrls.push(url);

    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    let rows = tables[table] ?? [];
    for (const [column, value] of url.searchParams) {
      if (column === "select" || column === "offset" || column === "limit" || column === "order") continue;
      if (value.startsWith("eq.")) {
        const target = value.slice(3);
        rows = rows.filter((r) => String(r[column]) === target);
      } else if (value.startsWith("in.(")) {
        const ids = value.slice(4, -1).split(",");
        rows = rows.filter((r) => ids.includes(String(r[column])));
      }
    }

    const offset = Number(url.searchParams.get("offset") ?? "0");
    const requestedLimit = url.searchParams.get("limit");
    const limit = requestedLimit ? Number(requestedLimit) : rows.length;
    const page = rows.slice(offset, offset + Math.min(limit, maxRowsPerResponse));
    return new Response(JSON.stringify(page), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;

  return { fetchImpl, requestUrls };
}
