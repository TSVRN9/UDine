// Release-build timing marks for the bake-off (PR #544, "Release profiling"). Compiled in only with EXPO_PUBLIC_PERF=1 (Metro inlines
// the env read, so otherwise every call is a no-op); a run's marks are printed to logcat 2.5 s after the last one, as ms since the first.
const ON = process.env.EXPO_PUBLIC_PERF === "1";
let marks: { n: string; t: number }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function mark(n: string): void {
  if (!ON) return;
  marks.push({ n, t: performance.now() });
  if (timer) clearTimeout(timer);
  timer = setTimeout(dump, 2500);
}

function dump() {
  const t0 = marks[0]?.t ?? 0;
  console.log("PERF " + marks.map((m, i) => `${m.n}@${(m.t - t0).toFixed(0)}${i ? `(+${(m.t - marks[i - 1].t).toFixed(0)})` : ""}`).join(" "));
  marks = [];
  timer = null;
}
