import type { FoodPreferences } from "@udine/shared";

const KEY = "udine-food-preferences";
const EMPTY: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

export function loadPreferences(): FoodPreferences {
	const raw = localStorage.getItem(KEY);
	if (!raw) return EMPTY;
	try {
		return JSON.parse(raw) as FoodPreferences;
	} catch {
		return EMPTY;
	}
}

export function savePreferences(prefs: FoodPreferences): void {
	localStorage.setItem(KEY, JSON.stringify(prefs));
}
