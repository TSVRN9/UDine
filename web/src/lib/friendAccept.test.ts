import { test } from "node:test";
import assert from "node:assert/strict";
import { canAcceptDirectly } from "./friendAccept.ts";

test("canAcceptDirectly: false for a qr-origin row (would always violate the both-confirm CHECK)", () => {
	assert.equal(canAcceptDirectly("qr"), false);
});

test("canAcceptDirectly: true for a search-origin row (the existing single-side-accept path)", () => {
	assert.equal(canAcceptDirectly("search"), true);
});
