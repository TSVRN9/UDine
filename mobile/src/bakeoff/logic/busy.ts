import type { Busy } from "./types";

/** One quantization for the band meter and the header board (M2 `lamps`). */
export const lamps = (pct: number) => Math.max(1, Math.ceil(pct / 20));

const fmtT = (m: number) => (m >= 1439 ? "midnight" : m === 720 ? "noon" : `${((Math.floor(m / 60) + 11) % 12) + 1}${m % 60 ? ":" + String(m % 60).padStart(2, "0") : ""} ${m < 720 ? "AM" : "PM"}`);

/** M2 `busyRow`: lit lamps, the word (low confidence is carried by the word, never the meter) and the header's extra line. */
export function busyView(b: Busy) {
  const word = b.confidence !== "good" ? "Probably " + b.label.toLowerCase() : b.label;
  let extra = "";
  if (b.calmer_at) { const [h, m] = b.calmer_at.split(":").map(Number); extra = `Calmer around ${fmtT(h * 60 + m)}`; }
  else if (b.vs_usual === "busier") extra = "Busier than usual";
  else if (b.vs_usual === "quieter") extra = "Quieter than usual";
  return { lamps: lamps(b.pct), word, extra };
}

/**
 * M2 `histSVG`: one column of five lamps per hour from the first hour; the current hour is lit by the live pct and
 * gold, later hours by the forecast point `outlook[i - nowI]` when it has one (M2's own indexing), else the typical day.
 */
export function boardAt([start, typical]: [number, number[]], b: Busy, nowMin: number) {
  const nowI = Math.floor(nowMin / 60) - start;
  return typical.map((x, i) => {
    const o = i > nowI && b.outlook[i - nowI];
    const val = i === nowI ? b.pct : o && o.pct != null ? o.pct : x;
    return { lit: lamps(val), now: i === nowI };
  });
}
