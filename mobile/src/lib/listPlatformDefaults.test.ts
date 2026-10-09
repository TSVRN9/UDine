// RN's SectionList defaults stickySectionHeadersEnabled to Platform.OS === 'ios', so iOS ran sticky
// headers (with layout animations) under the station scrubber's scrollToLocation, a combination
// Android never exercised. Every SectionList pins it off. Source-text check, same technique as
// hallMenuStyleParity.test.ts: per file, each SectionList tag needs a matching explicit prop.
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..");
const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("every SectionList sets stickySectionHeadersEnabled={false}", () => {
  for (const file of files(SRC)) {
    const src = fs.readFileSync(file, "utf8");
    const sections = count(src, /<(Gesture)?SectionList\b/g);
    if (!sections) continue;
    it(path.relative(SRC, file), () => {
      expect(count(src, /stickySectionHeadersEnabled=\{false\}/g)).toBeGreaterThanOrEqual(sections);
    });
  }
});
