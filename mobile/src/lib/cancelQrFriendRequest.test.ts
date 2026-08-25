import { cancelQrFriendRequest } from "./cancelQrFriendRequest";

type Row = { user_a: string; user_b: string; status: "pending" | "accepted"; origin: "search" | "qr" };

/**
 * A fake that actually *applies* each .eq() filter against seeded rows and removes matches --
 * not a spy that just records what arguments were passed. The load-bearing assertion is "the row
 * is still there afterward," matching the real RLS-filtered-delete semantics (a non-matching
 * WHERE clause deletes zero rows, no error).
 */
function client(rows: Row[]) {
  return {
    from(table: string) {
      if (table !== "friendships") throw new Error(`unexpected table ${table}`);
      let filters: Partial<Row> = {};
      const builder = {
        delete() {
          return builder;
        },
        eq(col: keyof Row, val: string) {
          filters = { ...filters, [col]: val };
          return builder;
        },
        then(resolve: (v: { error: null }) => void) {
          for (let i = rows.length - 1; i >= 0; i--) {
            const r = rows[i];
            if (Object.entries(filters).every(([k, v]) => r[k as keyof Row] === v)) rows.splice(i, 1);
          }
          resolve({ error: null });
        },
      };
      return builder;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const ME = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";

describe("cancelQrFriendRequest", () => {
  it("deletes the pending qr-origin row this flow created", async () => {
    const rows: Row[] = [{ user_a: ME, user_b: OTHER, status: "pending", origin: "qr" }];
    const { error } = await cancelQrFriendRequest(client(rows), ME, OTHER);
    expect(error).toBeNull();
    expect(rows).toHaveLength(0);
  });

  it("leaves an already-accepted qr-origin friendship intact (#236 -- re-scanning a real friend's code)", async () => {
    const rows: Row[] = [{ user_a: ME, user_b: OTHER, status: "accepted", origin: "qr" }];
    await cancelQrFriendRequest(client(rows), ME, OTHER);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("accepted");
  });

  it("leaves an accepted search-origin friendship intact", async () => {
    const rows: Row[] = [{ user_a: ME, user_b: OTHER, status: "accepted", origin: "search" }];
    await cancelQrFriendRequest(client(rows), ME, OTHER);
    expect(rows).toHaveLength(1);
  });

  it("leaves a pending search-origin friend request intact (not this flow's row to delete)", async () => {
    const rows: Row[] = [{ user_a: ME, user_b: OTHER, status: "pending", origin: "search" }];
    await cancelQrFriendRequest(client(rows), ME, OTHER);
    expect(rows).toHaveLength(1);
  });
});
