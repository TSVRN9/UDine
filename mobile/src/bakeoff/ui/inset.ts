import { m2 } from "../../lib/theme";

/** M2's `--sb`: the bottom inset a screen keeps, `max(10px, env(safe-area-inset-bottom))`. */
export const sbOf = (bottom: number) => Math.max(m2.size.sbMin, bottom);
