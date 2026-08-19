import type { DailyMacroTotals } from "@udine/shared";

/**
 * Calories contributed by each macro (4/4/9 kcal per gram) as a share of the day, plus their sum.
 * This is the cheap honest answer to "is 1800 a lot?" — it needs no goal, no profile and no server:
 * it describes the composition of what's logged rather than judging the amount. Shared between
 * MacroStats.svelte's per-macro "% of calories" labels and /today's split bar, both of which derive
 * the same percentages from the same totals — see #64 (web IA: Today-first home).
 */
export interface MacroCalorieBreakdown {
	total: number;
	shares: { protein: number; carbs: number; fat: number };
}

export function macroCalorieBreakdown(totals: DailyMacroTotals): MacroCalorieBreakdown {
	const calories = {
		protein: totals.proteinG * 4,
		carbs: totals.totalCarbG * 4,
		fat: totals.totalFatG * 9,
	};
	const total = calories.protein + calories.carbs + calories.fat;
	const pct = (kcal: number) => (total > 0 ? Math.round((kcal / total) * 100) : 0);
	return {
		total,
		shares: { protein: pct(calories.protein), carbs: pct(calories.carbs), fat: pct(calories.fat) },
	};
}
