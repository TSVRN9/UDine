import { openStatus } from "@udine/shared";
import type { DiningHallHours } from "@udine/shared";

const fmt = (d: Date) => {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m >= 1439) return "midnight";
  if (m === 720) return "noon";
  const mm = m % 60;
  return `${((Math.floor(m / 60) + 11) % 12) + 1}${mm ? ":" + String(mm).padStart(2, "0") : ""} ${m < 720 ? "AM" : "PM"}`;
};

/** M2's status(): "Open until 9 PM", "Opens 7 AM", "Closed for today". */
export function statusText(hours: DiningHallHours, now: Date): string {
  const s = openStatus(hours, now);
  return s.open ? `Open until ${fmt(s.closesAt)}` : s.opensAt ? `Opens ${fmt(s.opensAt)}` : "Closed for today";
}
export const isOpenNow = (hours: DiningHallHours, now: Date) => openStatus(hours, now).open;
