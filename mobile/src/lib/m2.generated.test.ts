import { readFileSync } from "fs";
import { join } from "path";
import { OUT, SRC, generate } from "../../scripts/gen-tokens";

const json = JSON.parse(readFileSync(SRC, "utf8"));

describe("design-tokens/m2.json is the one source", () => {
  it("m2.generated.ts is what the generator prints from it (run `pnpm tokens`)", () => {
    expect(readFileSync(OUT, "utf8")).toBe(generate(json));
  });
  it("every token two levels deep names the M2 rule it comes from", () => {
    const groups = Object.keys(json).filter((g) => !["$comment", "version", "rnOnly", "trace"].includes(g));
    const missing = groups.flatMap((g) => Object.keys(json[g]).map((k) => `${g}.${k}`)).filter((p) => !json.trace[p]);
    expect(missing).toEqual([]);
  });
  it("traces name no token that is gone", () => {
    const gone = Object.keys(json.trace).filter((p) => { const [g, k] = p.split("."); return !(g in json) || !(k in json[g]); });
    expect(gone).toEqual([]);
  });
  it("is stack-neutral: no RN font names, no unit strings", () => {
    const text = JSON.stringify({ ...json, trace: undefined, $comment: undefined });
    expect(text).not.toMatch(/_\d00(Regular|Medium|SemiBold|Bold)|\dpx|\ddp/);
  });
  it("the push timings are the container's, on the push curve", () => {
    expect(json.motion.pushIn).toEqual({ d: json.motion.cont.d, e: json.motion.push.e });
    expect(json.motion.pushOut).toEqual({ d: json.motion.contBack.d, e: json.motion.push.e });
  });
  it("the font metrics are the shipped TTFs' hhea ratios", () => {
    const dir = join(__dirname, "../../node_modules/@expo-google-fonts");
    const ratio = (file: string) => {
      const b = readFileSync(file), n = b.readUInt16BE(4), at: Record<string, number> = {};
      for (let i = 0; i < n; i++) at[b.toString("latin1", 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(20 + i * 16);
      return (b.readInt16BE(at.hhea + 4) - b.readInt16BE(at.hhea + 6) + b.readInt16BE(at.hhea + 8)) / b.readUInt16BE(at.head + 18);
    };
    expect(ratio(join(dir, "libre-franklin/400Regular/LibreFranklin_400Regular.ttf"))).toBeCloseTo(json.fontMetrics["Libre Franklin"].normalLine, 3);
    expect(ratio(join(dir, "oswald/600SemiBold/Oswald_600SemiBold.ttf"))).toBeCloseTo(json.fontMetrics.Oswald.normalLine, 3);
  });
  it("the spacing that names an M2 rule has that rule's number (src.html: .sec 153, .evband 114, .stack, .cbody 257, .dh~.dh 354, .yhead 381)", () => {
    expect(json.space).toMatchObject({ sectionTop: 22, cafeBodyTop: 20, dietGroupTop: 28, eventTop: 16, eventBottom: 20, eventDate: 12, eventLinks: 12, yheadBottom: 18 });
  });
  it("every token marked rnOnly is there, and the header says how easing names resolve", () => {
    const missing = json.rnOnly.filter((p: string) => { const [g, k] = p.split("."); return !(g in json) || !(k in json[g]); });
    expect(missing).toEqual([]);
    expect(json.$comment).toMatch(/resolves through `curves`/);
  });
  it("the head's bottom grade has all four of M2's stops (.bgrad: 0, .5 at 30%, .74 at 50%, .93 at 76%)", () => {
    expect(json.gradient.headBottom.stops).toEqual(["rgba(59,10,15,0)", "rgba(59,10,15,0.5)", "rgba(59,10,15,0.74)", "rgba(59,10,15,0.93)"]);
    expect(json.gradient.headBottom.locations).toEqual([0, 0.3, 0.5, 0.76]);
  });
});
