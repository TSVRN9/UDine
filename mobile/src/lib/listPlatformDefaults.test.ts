// RN list defaults that differ by Platform.OS make iOS run code Android never verified (the hall
// menu scrubber's scrollToLocation vs iOS sticky headers). Every list pins the Android value.
// Source-text check, same technique as hallMenuStyleParity.test.ts: per file, each list tag needs
// a matching explicit prop.
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("list props with platform-divergent RN defaults are explicit", () => {
  for (const file of files(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    const sections = count(src, /<(Gesture)?SectionList\b/g);
    const lists = sections + count(src, /<FlatList\b/g);
    if (!lists) continue;
    const rel = path.relative(SRC, file);
    if (sections) {
      it(`${rel}: every SectionList sets stickySectionHeadersEnabled={false}`, () => {
        expect(count(src, /stickySectionHeadersEnabled=\{false\}/g)).toBeGreaterThanOrEqual(sections);
      });
    }
    it(`${rel}: every list sets removeClippedSubviews`, () => {
      expect(count(src, /removeClippedSubviews=\{true\}/g)).toBeGreaterThanOrEqual(lists);
    });
  }
});
