/**
 * A pushed hall moves only when both are true: it has settled (drawn and scrolled to its dish, out of sight) and the sheet it came
 * from is half-way out (M2 `isheet.away`). Neither alone starts it, and it starts once.
 */
export interface Gate { settled: boolean; go: boolean; started: boolean }
/** M2 `sh.away`: where a sheet whose top is at `y` is half-way to closed (`H`); what follows the sheet starts once it passes this. */
export const halfwayOut = (y: number, H: number): number => y + (H - y) / 2;
export const closedGate: Gate = { settled: false, go: false, started: false };
export function gateStep(g: Gate, e: "settled" | "go"): { gate: Gate; start: boolean } {
  const next = { ...g, [e]: true };
  const start = next.settled && next.go && !g.started;
  return { gate: start ? { ...next, started: true } : next, start };
}
