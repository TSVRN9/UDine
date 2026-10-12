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
    expect(await lint(`withTiming(1, { duration: 240 });`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
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
    for (const k of ['"fontSize": 14', '["lineHeight"]: 20', '"letterSpacing": 1', '"duration": 240', '["delay"]: 90', '"stiffness": 300', '["damping"]: 20', '"mass": 1'])
      expect(await lint(`export const s = { ${k} };`, "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects negative literals for those keys", async () => {
    expect(await lint("export const s = { letterSpacing: -0.5 };", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
    expect(await lint("withTiming(1, { delay: -1 });", "src/bakeoff/screens/x.tsx")).toHaveLength(1);
  });
  it("rejects Easing.bezier with literal arguments outside motion.ts", async () => {
    expect(await lint("const e = Easing.bezier(0.2, 0, 0, 1);", "src/bakeoff/screens/x.tsx")).toHaveLength(4);
    expect(await lint("const e = Easing.bezier(0.2, 0, 0, -1);", "src/app/bakeoff/x.tsx")).toHaveLength(4);
  });
  it("allows Easing.bezier fed from m2Motion", async () => {
    expect(await lint("const e = Easing.bezier(...m2Motion.settle.e);", "src/bakeoff/screens/x.tsx")).toHaveLength(0);
  });
  it("allows literals inside the kit", async () => {
    expect(await lint(`export const s = { color: "#881c1c", fontSize: 14 };`, "src/bakeoff/ui/x.tsx")).toHaveLength(0);
  });
  it("allows literals in the logic layer", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/bakeoff/logic/x.ts")).toHaveLength(0);
  });
  it("leaves the shipped app alone", async () => {
    expect(await lint(`export const s = { color: "#881c1c" };`, "src/app/x.tsx")).toHaveLength(0);
  });
});
