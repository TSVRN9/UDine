// Shared pagination/chunking helpers, extracted for issue #261: check-favorited-foods/index.ts
// (favorited_foods, profiles) and this module's own push_tokens lookup all queried a table with a
// plain `.select()` / `.in("user_id", ids)`, which silently truncates at PostgREST's max_rows
// (config.toml: 1000, same as the Supabase cloud default -- a response past row 1000 is just
// dropped, no error) and, separately, 414s outright once the `.in()` id list gets long enough to
// blow past a safe URL length (confirmed live: 300 uuids = an 11,189-byte URL = 414). Below ~215
// opted-in users the function 500s on every hourly run; below that it silently drops rows past 1000
// with no error at all.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// MUST equal config.toml's max_rows exactly, not just "not exceed" it -- fetchAllPages below treats
// "got fewer than PAGE_SIZE rows back" as the end-of-data signal. If max_rows is ever lowered below
// this constant, every first page comes back short of PAGE_SIZE and fetchAllPages stops there,
// silently reintroducing the truncation this file exists to fix. Keep the two in sync by hand.
export const PAGE_SIZE = 1000;

// Keeps a `user_id=in.(...)` filter's URL comfortably under typical proxy/server URL limits (nginx's
// default is 8k) -- well under the 300-uuid/11,189-byte URL that 414'd in the issue's own repro.
export const ID_CHUNK_SIZE = 150;

export type PagedResult<T> = { data: T[] | null; error: { message: string } | null };

/** Pages a query in PAGE_SIZE-row windows via .range(), stopping as soon as a page comes back short
 * (fewer than PAGE_SIZE rows) -- the standard "did we hit the end" signal, since PostgREST doesn't
 * error or flag truncation on its own; it just silently caps each response at max_rows. */
export async function fetchAllPages<T>(queryFor: (from: number, to: number) => PromiseLike<PagedResult<T>>): Promise<PagedResult<T>> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await queryFor(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: all, error: null };
}

/** Splits `ids` into ID_CHUNK_SIZE-sized groups so each `.in(column, chunk)` filter's URL stays
 * short enough that PostgREST/whatever proxy sits in front of it doesn't reject it with a 414. */
export function chunkIds<T>(ids: T[], size: number = ID_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Fetches every row of `table` matching `.in(idColumn, ids)`, chunking `ids` (ID_CHUNK_SIZE) and
 * paging each chunk (PAGE_SIZE via fetchAllPages) so neither cap can silently drop or 414 rows.
 *
 * `orderColumns` MUST name a total order (e.g. the table's full primary key) -- Postgres/PostgREST
 * make no row-order guarantee across separate `offset`/`limit` requests without one, so without an
 * explicit, unique sort, paging across multiple requests can silently duplicate or skip rows at page
 * boundaries (same failure class this whole fix exists to close, through a different door). See
 * postgrest-js's own PostgrestTransformBuilder.range() doc comment for this exact warning. */
// ponytail: a row inserted between this call's pages (e.g. a favorite added mid-run) can be skipped
// until next hour's cron run picks it up -- not paged over a snapshot/transaction. Deletes are
// harmless (food_sightings upserts with ignoreDuplicates, so a skipped-then-later-seen favorite just
// costs a delayed alert, never a duplicate or wrong one). Upgrade path if same-run freshness ever
// matters: a snapshotting read (e.g. a `pg_snapshot`-pinned RPC) instead of plain offset/limit.
export async function fetchAllForIds<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  idColumn: string,
  ids: string[],
  orderColumns: string[],
): Promise<PagedResult<T>> {
  const all: T[] = [];
  for (const idChunk of chunkIds(ids)) {
    const { data, error } = await fetchAllPages<T>((from, to) => {
      // deno-lint-ignore no-explicit-any
      let query = (supabase.from(table).select(select) as any).in(idColumn, idChunk);
      for (const col of orderColumns) query = query.order(col);
      return query.range(from, to);
    });
    if (error) return { data: null, error };
    all.push(...(data ?? []));
  }
  return { data: all, error: null };
}
