import type { DiningHallHours, TimeWindow } from "@udine/shared";

export type HallKey = "W" | "F" | "H" | "B";
export type PlaceKey = HallKey | `c${number}`;
export type MealKey = "breakfast" | "lunch" | "dinner" | "late" | "grab" | "all";
export type Carbon = "A" | "B" | "C" | "D" | "E";
export interface Nutrition {
  fatCal: number | null; fat: number | null; fatDv: number | null; sat: number | null; satDv: number | null;
  trans: number | null; chol: number | null; sod: number | null; sodDv: number | null; carb: number | null; carbDv: number | null;
  fiber: number | null; fiberDv: number | null; sugar: number | null; protein: number | null; proteinDv: number | null;
}
export interface Dish {
  key: string; name: string; station: string; cal: number; p: number; c: number; f: number;
  diet: number; /* 1 veg, 2 plant, 4 halal, 8 local, 16 sustainable */
  serving: string; nutrition: Nutrition; ingredients: string; allergens: string[];
  health: number | null; carbon: Carbon | null; price: number | null;
}
export interface Station { name: string; dishes: Dish[] }
export interface Place {
  key: PlaceKey; name: string; area: number; building: string; description: string; payment: string;
  address: string | null; mapAddress: string | null;
}
export interface FixtureEvent { title: string; expires: number; links: [string, string][]; scope: string }
export interface Busy {
  level: number; label: string; pct: number; usual_pct: number; trend: string; vs_usual: "usual" | "busier" | "quieter";
  outlook: { in: number; pct: number | null }[]; calmer_at: string | null; confidence: "good" | "new";
}
export interface Fixture {
  clock: string;
  areas: string[];
  places: Place[];
  hours: Record<PlaceKey, DiningHallHours>;
  grab: Record<HallKey, TimeWindow>;
  /** M2's simulated Thursday-lunch busy values per hall, and the typical-Thursday board: [first hour, % per hour] */
  busy: Record<HallKey, Busy>;
  typical: Record<HallKey, [number, number[]]>;
  /** every distinct dish served in the 15 days (station is "" here; a serving's station is on `days`) */
  dishes: Dish[];
  days: Record<string, Partial<Record<PlaceKey, Partial<Record<MealKey, Station[]>>>>>;
  events: FixtureEvent[];
}
