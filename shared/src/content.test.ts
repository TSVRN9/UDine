import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchNewsletter, fetchStaff, mapEvent, mapStaffMember } from "./content.ts";

// See openFoodFacts.test.ts for the same withFetch pattern — swaps globalThis.fetch for a stub.
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

// fetchEvents/fetchPressReleases/fetchFaq are thin fetch+shape-mapping wrappers around endpoints
// confirmed live in docs/apk-reverse-engineering.md; the only non-trivial logic is mapEvent's
// unix-seconds -> ISO conversion and "0"/"1" -> boolean coercion, tested here against the real
// response shape captured during that verification pass rather than re-fetching over the network.

test("event mapping converts unix-seconds expiration and featured flag correctly", () => {
  // Real sample captured from GET /uapp/get_beacons_events, see docs/apk-reverse-engineering.md.
  const mapped = mapEvent({
    title: "Summer Hours",
    featured_image: "https://umassdining.com/sites/default/files/events/Summer%20Hours%20Banner_0.jpg",
    pdf_link: "https://umassdining.com/sites/default/files/events/Summer%202026%20Hours%20-%20Harvest%20Update.jpg",
    external_link: "",
    expiration_date: 1788148800,
    is_featured: "0",
  });
  assert.equal(mapped.expirationDate, new Date(1788148800 * 1000).toISOString());
  assert.equal(mapped.isFeatured, false);
});

test("event mapping treats is_featured '1' as true", () => {
  const mapped = mapEvent({ title: "x", featured_image: "", pdf_link: "", external_link: "", expiration_date: 0, is_featured: "1" });
  assert.equal(mapped.isFeatured, true);
});

// mapStaffMember's only non-trivial logic is the profile_image -> profileImage rename; field
// shape below matches the response verified live 2026-08-18 (GET /uapp/get_staff, real data).
test("staff mapping renames profile_image to profileImage and passes other fields through", () => {
  const mapped = mapStaffMember({
    name: "Jane Doe",
    bio: "<p>20 years in dining services.</p>",
    title: "Executive Chef",
    department: "Culinary",
    email: "jdoe@umass.edu",
    profile_image: "https://umassdining.com/sites/default/files/staff/jdoe.jpg",
  });
  assert.deepEqual(mapped, {
    name: "Jane Doe",
    bio: "<p>20 years in dining services.</p>",
    title: "Executive Chef",
    department: "Culinary",
    email: "jdoe@umass.edu",
    profileImage: "https://umassdining.com/sites/default/files/staff/jdoe.jpg",
  });
});

// A real ~5-of-31 minority of entries (e.g. "Student Ambassadors") omit `email` entirely —
// verified live 2026-08-18. mapStaffMember must not choke on that.
test("staff mapping tolerates a missing email field", () => {
  const mapped = mapStaffMember({
    name: "Student Ambassadors",
    bio: "",
    title: "Ambassadors",
    department: "Marketing",
    profile_image: "",
  });
  assert.equal(mapped.email, undefined);
});

test("fetchStaff preserves the API's own array order (no client-side sort)", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [
          { name: "Second", bio: "", title: "", department: "", email: "b@umass.edu", profile_image: "" },
          { name: "First", bio: "", title: "", department: "", email: "a@umass.edu", profile_image: "" },
        ],
      }) as Response,
    fetchStaff,
  );
  assert.deepEqual(result.map((s) => s.name), ["Second", "First"]);
});

test("fetchStaff throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => [] }) as Response, fetchStaff),
    /get_staff 500/,
  );
});

// fetchNewsletter is a thin passthrough (field names already match NewsletterIssue), same as
// fetchPressReleases/fetchFaq above — this just confirms the shape flows through untouched.
test("fetchNewsletter returns issues as-is, including entries with empty content", async () => {
  const result = await withFetch(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => [{ content: "", period: "February 2020", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=def" }],
      }) as Response,
    fetchNewsletter,
  );
  assert.deepEqual(result, [{ content: "", period: "February 2020", link: "https://umassdining.us1.list-manage.com/track/click?u=abc&id=def" }]);
});

test("fetchNewsletter throws when the HTTP response is not ok", async () => {
  await assert.rejects(
    () => withFetch(async () => ({ ok: false, status: 500, json: async () => [] }) as Response, fetchNewsletter),
    /get_newsletter 500/,
  );
});
