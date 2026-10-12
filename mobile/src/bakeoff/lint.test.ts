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
