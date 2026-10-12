import fs from "fs";
import path from "path";
import { loadFixture } from "./logic/fixture";
import { photoOf } from "./photos";

const dir = path.join(__dirname, "../../assets/bakeoff/retail");
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

it("every café with a photo in the bundled set resolves to it, and one without stays plain", () => {
  const files = new Set(fs.readdirSync(dir).map((f) => f.replace(/\.(jpg|png)$/, "")));
  const cafes = loadFixture().places.filter((p) => p.key.startsWith("c"));
  const have = cafes.filter((p) => files.has(slug(p.name)));
  expect(have.length).toBeGreaterThan(20);
  for (const p of have) expect([p.name, photoOf(p.key, p.name) != null]).toEqual([p.name, true]);
  expect(photoOf("c28", "Charles River Campus")).toBeUndefined();
});
