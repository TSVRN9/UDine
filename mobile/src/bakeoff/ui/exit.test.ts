// layout-animation builders are no-ops under the reanimated mock: these record what they were given
type Rec = { d?: number; e?: unknown };
const rec = (): Rec & { duration(d: number): Rec; easing(e: unknown): Rec } => ({ duration(d) { this.d = d; return this; }, easing(e) { this.e = e; return this; } });
afterEach(() => jest.resetModules());

const load = () => {
  jest.doMock("react-native-reanimated", () => ({ ...jest.requireActual("react-native-reanimated/mock"), FadeOut: rec(), LinearTransition: rec() }));
  return { ...(require("./exit") as { exitOut: Rec; exitLayout: Rec }), m2Motion: (require("../../lib/motion") as typeof import("../../lib/motion")).m2Motion };
};

// M2 `A(prow, [{height, opacity: 1}, {height: 0, opacity: 0}], 'exit')` (src.html:2113): a removed plate row leaves on `exit` and the rows below close up on it
describe("a removed plate row", () => {
  it("fades out on exit: 150 ms, (.3, 0, .8, .2)", () => {
    const { exitOut, m2Motion } = load();
    expect(exitOut.d).toBe(m2Motion.exit.d);
    expect(exitOut.e).toBe(m2Motion.exit.e);
  });
  it("and the rows under it close up on the same", () => {
    const { exitLayout, m2Motion } = load();
    expect(exitLayout.d).toBe(m2Motion.exit.d);
    expect(exitLayout.e).toBe(m2Motion.exit.e);
  });
});
