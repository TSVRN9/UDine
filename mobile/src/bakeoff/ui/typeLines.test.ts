import { readFileSync } from "fs";
import { join } from "path";
import { m2 } from "../../lib/theme";

// hhea (ascender - descender + lineGap) / unitsPerEm of the shipped TTF: what CSS `line-height: normal` resolves to
const dir = join(__dirname, "../../../node_modules/@expo-google-fonts");
function normalOf(file: string): number {
  const b = readFileSync(file);
  const n = b.readUInt16BE(4);
  const at: Record<string, number> = {};
  for (let i = 0; i < n; i++) at[b.toString("latin1", 12 + i * 16, 16 + i * 16)] = b.readUInt32BE(20 + i * 16);
  const upm = b.readUInt16BE(at.head + 18), h = at.hhea;
  return (b.readInt16BE(h + 4) - b.readInt16BE(h + 6) + b.readInt16BE(h + 8)) / upm;
}
const BODY = normalOf(join(dir, "libre-franklin/400Regular/LibreFranklin_400Regular.ttf"));
const NUM = normalOf(join(dir, "oswald/600SemiBold/Oswald_600SemiBold.ttf"));
const r1 = (x: number) => Math.round(x * 10) / 10;

describe("M2 sets no line-height on these rules, so the line is the font's normal one", () => {
  it("the metrics this reads are Libre Franklin 1.212 and Oswald 1.482", () => {
    expect(r1(BODY * 1000) / 1000).toBeCloseTo(1.212, 3);
    expect(r1(NUM * 1000) / 1000).toBeCloseTo(1.482, 3);
  });
  it.each([
    ["status", BODY], ["statusSm", BODY], ["metaNum", NUM], ["stationHead", NUM],
    // the free-flowing rest of 1b: rules M2 sets no line-height on, in rows that grow with their text
    ["meta", BODY], ["date", BODY], ["link", BODY], ["lblRow", BODY], ["lblThin", BODY], ["factRow", BODY], ["factNum", NUM], ["dv", NUM], ["lblLg", BODY],
    // `.brand{font:600 22px Oswald}` and `.hhead .date` (15 px) set no line-height: M2 puts the brand box at 34 (32 high) and the date box at 46 (18 high)
    ["brand", NUM], ["headDate", BODY],
  ] as const)("%s", (v, ratio) => {
    expect(m2.type[v].line).toBe(r1(m2.type[v].size * ratio));
  });
});
