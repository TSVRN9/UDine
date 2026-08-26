import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiningEvent, PressRelease } from "@udine/shared";
import { filterActiveEvents, sanitizeEvents, sanitizeReleases } from "./pressEvents.ts";

const release: PressRelease = { title: "t", url: "https://umassdining.com/a", image: "", date: "2026-01-01" };

const event: DiningEvent = {
	title: "t",
	featuredImage: "",
	pdfLink: "https://umassdining.com/a.pdf",
	externalLink: "https://umassdining.com/info",
	expirationDate: "2026-01-01T00:00:00.000Z",
	isFeatured: false
};

test("filterActiveEvents: drops events whose expirationDate has already passed", () => {
	const expired: DiningEvent = { ...event, expirationDate: "2020-01-01T00:00:00.000Z" };
	const active: DiningEvent = { ...event, expirationDate: "2099-01-01T00:00:00.000Z" };
	const result = filterActiveEvents([expired, active], new Date("2026-08-25T00:00:00.000Z"));
	assert.deepEqual(result, [active]);
});

test("sanitizeReleases: blanks a javascript: url instead of passing it through to the anchor", () => {
	const malicious: PressRelease = { ...release, url: "javascript:alert(1)" };
	assert.equal(sanitizeReleases([malicious])[0].url, "");
});

test("sanitizeEvents: blanks javascript:/data: pdfLink and externalLink, not just featuredImage", () => {
	const malicious: DiningEvent = { ...event, pdfLink: "javascript:alert(1)", externalLink: "data:text/html,x" };
	const [sanitized] = sanitizeEvents([malicious]);
	assert.equal(sanitized.pdfLink, "");
	assert.equal(sanitized.externalLink, "");
});
