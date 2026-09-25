import assert from "node:assert/strict";
import { test } from "node:test";
import { matchesQuery } from "./search.ts";

test("matches every token as a substring, regardless of word order or inserted words", () => {
  assert.equal(matchesQuery("White Cheese Pizza", "white pizza"), true);
  assert.equal(matchesQuery("White Cheese Pizza", "pizza white"), true); // order doesn't matter
});

test("does not match when a token is missing entirely", () => {
  assert.equal(matchesQuery("White Kidney Beans", "white pizza"), false);
});

test("is case-insensitive", () => {
  assert.equal(matchesQuery("white cheese pizza", "WHITE PIZZA"), true);
});

test("collapses punctuation and double spaces to a single separator before comparing", () => {
  assert.equal(matchesQuery("White Cheese Pizza", "pizza, white"), true);
  assert.equal(matchesQuery("White Cheese Pizza", "white  pizza"), true); // double space
});

test("a plain substring (single token) still matches, same as the old behavior", () => {
  assert.equal(matchesQuery("Grandma's Lasagna", "lasagna"), true);
  assert.equal(matchesQuery("Grandma's Lasagna", "pizza"), false);
});

test("a blank query matches everything (vacuous truth over zero tokens)", () => {
  assert.equal(matchesQuery("Anything", ""), true);
  assert.equal(matchesQuery("Anything", "   "), true);
});
