import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMenuDate } from "./date.ts";

const TODAY = "2026-08-19";

test("resolveMenuDate: absent date param falls back to today", () => {
  assert.equal(resolveMenuDate(null, TODAY), TODAY);
});

test("resolveMenuDate: empty date param falls back to today", () => {
  assert.equal(resolveMenuDate("", TODAY), TODAY);
});

test("resolveMenuDate: a past date falls back to today", () => {
  assert.equal(resolveMenuDate("2026-08-01", TODAY), TODAY);
});

test("resolveMenuDate: garbage input falls back to today", () => {
  assert.equal(resolveMenuDate("banana", TODAY), TODAY);
});

test("resolveMenuDate: an impossible month (13) falls back to today, not a lexicographic pass-through", () => {
  // Lexicographically "2026-13-99" > "2026-08-19", which is exactly the bug: an unbounded regex +
  // string compare lets this through and it renders as "Invalid Date" downstream.
  assert.equal(resolveMenuDate("2026-13-99", TODAY), TODAY);
});

test("resolveMenuDate: an impossible year/month/day falls back to today", () => {
  assert.equal(resolveMenuDate("9999-99-99", TODAY), TODAY);
});

test("resolveMenuDate: a valid future ISO date passes through unchanged", () => {
  assert.equal(resolveMenuDate("2026-08-20", TODAY), "2026-08-20");
});
