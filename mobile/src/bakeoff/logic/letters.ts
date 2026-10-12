import type { HallKey } from "./types";

/**
 * The letter's text x inside its 200 px box, which is right-aligned to the band (M2 src.html `LX`, owner-approved
 * round 10). The box moves with the band's width, so the ink's left edge is W 262, F 296, H 285.5, B 288 at 390 and
 * 30 less at 360: a deliberately loose column.
 */
export const HALL_LX: Record<HallKey, number> = { W: 72, F: 99, H: 88, B: 91 };
