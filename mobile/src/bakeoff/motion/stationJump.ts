/**
 * A station jump (M2 `scrollTo`, `MO.scroll`): the list travels to the station on `scroll` timing, starting from where it is. With reduced motion
 * (M2 `RM`, src.html:1507) it does not travel: the list is set at the station, and nothing is left running that could scroll it back.
 */
export type StationJump = { kind: "set"; to: number } | { kind: "travel"; from: number; to: number };
export const stationJump = (reduced: boolean, from: number, to: number): StationJump => (reduced ? { kind: "set", to } : { kind: "travel", from, to });

/** Runs the jump through whatever scrolls the list: `set` puts it at the station, `travel` starts the timed scroll from where it is. */
export function goToStation(reduced: boolean, from: number, to: number, io: { set: (to: number) => void; travel: (from: number, to: number) => void }) {
  const j = stationJump(reduced, from, to);
  if (j.kind === "set") io.set(j.to);
  else io.travel(j.from, j.to);
}
