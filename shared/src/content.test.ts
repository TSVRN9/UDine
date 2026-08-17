import assert from "node:assert/strict";
import { test } from "node:test";
import { mapEvent } from "./content.ts";

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
