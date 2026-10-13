import { ESLint } from "eslint";

// ESLint loads eslint.config.js with a dynamic import(), which jest's VM doesn't allow; hand it the
// already-required config instead.
const eslint = new ESLint({
  cwd: __dirname + "/../..",
  overrideConfigFile: true,
  overrideConfig: require("../../eslint.config.js"),
});
const lint = async (code: string, file: string) =>
  (await eslint.lintText(code, { filePath: `${__dirname}/../../${file}` }))[0].messages.filter(
    (m) => m.ruleId === "no-restricted-syntax",
  );

describe("bake-off literal ban", () => {
  it("rejects a raw colour in a bakeoff screen", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/app/bakeoff/x.tsx")).toHaveLength(1);
  });
  it("rejects rgba() in a bakeoff screen", async () => {
    expect(await lint(`export const s = { color: "rgba(0,0,0,.5)" };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects a raw duration in a bakeoff screen", async () => {
    expect(await lint(`export const cfg = { duration: 240 };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects a raw font size in a bakeoff screen", async () => {
    expect(await lint(`export const s = { fontSize: 14 };`, "src/app/bakeoff/x.tsx")).toHaveLength(1);
  });
  it("rejects a colour inside a template literal", async () => {
    expect(await lint("export const s = { color: `#881c1c` };", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
    expect(await lint("export const s = { color: `rgb(${r}, 0, 0)` };", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects rgb(), hsl(), hsla() and a colour with leading whitespace", async () => {
    for (const c of ["rgb(0,0,0)", "hsl(0 0% 0%)", "hsla(0,0%,0%,.5)", " #881c1c", "\\n#fff"])
      expect(await lint(`export const s = { color: "${c}" };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects quoted and computed type and motion keys", async () => {
    for (const k of ['"fontSize": 14', '["lineHeight"]: 20', '"letterSpacing": 2', '"duration": 240', '["delay"]: 90', '"stiffness": 300', '["damping"]: 20', '"mass": 1'])
      expect(await lint(`export const s = { ${k} };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects negative literals for those keys", async () => {
    expect(await lint("export const s = { letterSpacing: -0.5 };", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
    expect(await lint("export const s = { delay: -1 };", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects Easing.bezier with literal arguments outside motion.ts", async () => {
    expect(await lint("const e = Easing.bezier(0.2, 0, 0, 1);", "src/bakeoff/screens/x.tsx")).toHaveLength(4);
    expect(await lint("const e = Easing.bezier(0.2, 0, 0, -1);", "src/app/bakeoff/x.tsx")).toHaveLength(4);
  });
  it("allows Easing.bezier fed from m2Motion", async () => {
    expect(await lint("const e = Easing.bezier(...m2Motion.settle.e);", "src/bakeoff/screens/x.tsx")).toHaveLength(0);
  });
  it("holds the kit to the same ban", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
    expect(await lint(`export const s = { fontSize: 14 };`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
    expect(await lint(`export const s = { borderColor: "rgba(36,23,26,0.22)" };`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
  });
});

describe("bake-off size, radius, opacity and timing ban (kit and screens)", () => {
  const files = ["src/bakeoff/ui/x.tsx", "src/bakeoff/screens/x.tsx", "src/app/bakeoff/x.tsx"];
  it.each(files)("rejects a literal size, gap, inset or radius in %s", async (f) => {
    for (const v of ["width: 48", "minHeight: 56", "paddingHorizontal: 20", "marginTop: 3", "gap: 12", "top: 40", "borderRadius: 8", "borderTopLeftRadius: 3", "borderLeftWidth: 4", "columnGap: 10"])
      expect(await lint(`export const s = { ${v} };`, f)).toHaveLength(1);
  });
  it("rejects a literal anywhere in the value: a sum, a ternary, a negation", async () => {
    for (const v of ["top: y + 44", "left: end.x - 26 + 6", "paddingLeft: letter ? 8 : 16", "marginTop: -4", "bottom: -(10 + room)", "height: top + 52"])
      expect((await lint(`export const s = { ${v} };`, "src/bakeoff/ui/x.tsx")).length).toBeGreaterThan(0);
  });
  it("rejects quoted and computed keys for them too", async () => {
    for (const v of ['"width": 48', '["borderRadius"]: 8', '"paddingTop": 22'])
      expect(await lint(`export const s = { ${v} };`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
  });
  it("rejects a literal opacity other than 0 and 1", async () => {
    expect(await lint(`export const s = { opacity: 0.4 };`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
    expect(await lint(`export const s = { opacity: disabled ? 0.4 : 1 };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects a timing call that does not go through the kit's timed()", async () => {
    for (const c of ["withTiming(1, m2Motion.settle)", "withSpring(1)", "withDelay(10, x)"]) expect((await lint(`${c};`, "src/bakeoff/screens/x.tsx")).length).toBeGreaterThan(0);
    expect(await lint(`const k = new Keyframe({}).duration(200);`, "src/bakeoff/ui/x.tsx")).toHaveLength(1);
  });
  it("lets timed() be the one place that calls withTiming", async () => {
    expect(await lint(`export const timed = (to, t) => withTiming(to, { duration: t.d, easing: t.e });`, "src/bakeoff/ui/motion.ts")).toHaveLength(0);
  });
  it("allows tokens, and the structure literals 0 and 1", async () => {
    for (const v of ["width: m2.size.tap", "gap: m2.space.part", "marginTop: -m2.space.line", "top: 0", "left: 0", "borderBottomWidth: 1", "height: 1", "opacity: 1", "opacity: 0", 'width: "100%"', "borderRadius: m2.radius.pill", "marginTop: top + m2.space.headTop"])
      expect(await lint(`export const s = { ${v} };`, "src/bakeoff/ui/x.tsx")).toHaveLength(0);
  });
  it("leaves SVG props (JSX attributes) alone: they are drawing, not layout", async () => {
    expect(await lint(`export const A = () => <Svg width={24} height={24} viewBox="0 0 24 24" strokeWidth={2.2}><Rect rx={4.5} /></Svg>;`, "src/bakeoff/ui/x.tsx")).toHaveLength(0);
  });
  it("leaves tests and the logic layer alone", async () => {
    expect(await lint(`export const s = { width: 48, color: "#fff" };`, "src/bakeoff/ui/x.test.tsx")).toHaveLength(0);
    expect(await lint(`export const s = { width: 48 };`, "src/bakeoff/logic/x.ts")).toHaveLength(0);
  });
  it("allows literals in the logic layer", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/bakeoff/logic/x.ts")).toHaveLength(0);
  });
  it("leaves the shipped app alone", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/app/x.tsx")).toHaveLength(0);
  });
});
