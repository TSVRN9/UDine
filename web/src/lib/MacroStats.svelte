<script lang="ts">
	import type { DailyMacroTotals } from "@udine/shared";
	import { macroCalorieBreakdown } from "./macroShares";

	// The 4-up calorie/protein/carb/fat grid shared between /today's full detail view and the home
	// dashboard's macros-so-far summary (#64) — same numbers, same source (computeDailyTotals), so
	// this is the one place that renders them rather than two copies drifting apart. No card wrapper,
	// no split bar here: /today keeps those (see its own <section class="card"> and the bar markup
	// below this component's usage there) since the home dashboard doesn't show the bar.
	let { totals, entryCount }: { totals: DailyMacroTotals; entryCount: number } = $props();

	const breakdown = $derived(macroCalorieBreakdown(totals));
</script>

<div class="grid grid-cols-2 gap-5 sm:grid-cols-4">
	<div class="stat">
		<span class="stat-label">Calories:</span>
		<span class="stat-value">{totals.calories}</span>
		<span class="mt-1 block text-xs text-ink-900/50">from {entryCount} {entryCount === 1 ? "entry" : "entries"}</span>
	</div>
	<div class="stat">
		<span class="stat-label">Protein:</span>
		<span class="stat-value">{totals.proteinG.toFixed(1)}g</span>
		<span class="mt-1 block text-xs text-ink-900/50">{breakdown.shares.protein}% of calories</span>
	</div>
	<div class="stat">
		<span class="stat-label">Carbs:</span>
		<span class="stat-value">{totals.totalCarbG.toFixed(1)}g</span>
		<span class="mt-1 block text-xs text-ink-900/50">{breakdown.shares.carbs}% of calories</span>
	</div>
	<div class="stat">
		<span class="stat-label">Fat:</span>
		<span class="stat-value">{totals.totalFatG.toFixed(1)}g</span>
		<span class="mt-1 block text-xs text-ink-900/50">{breakdown.shares.fat}% of calories</span>
	</div>
</div>
