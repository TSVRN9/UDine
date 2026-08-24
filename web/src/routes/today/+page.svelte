<script lang="ts">
	import { onMount } from "svelte";
	import {
		computeDailyTotals,
		exportEntriesAsCsv,
		exportEntriesAsJson,
		exportFavoritesAsCsv,
		exportFavoritesAsJson,
		exportRankedDishesAsCsv,
		exportRankedDishesAsJson,
		exportRankedFoodsAsCsv,
		exportRankedFoodsAsJson,
		type DailyMacroTotals,
		type LogEntry,
	} from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbRankingStorage } from "$lib/rankingStorage";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { todayIso } from "$lib/date";
	import { macroCalorieBreakdown } from "$lib/macroShares";
	import MacroStats from "$lib/MacroStats.svelte";

	// IndexedDB only exists in the browser — this page has no SSR-safe data to render on
	// its own, so the storage instances and the initial load both wait for the client.
	let storage: IndexedDbLogStorage | undefined;
	let rankingStorage: IndexedDbRankingStorage | undefined;
	let favoritesStorage: IndexedDbFavoritesStorage | undefined;
	const date = todayIso();

	let entries: LogEntry[] = $state([]);
	let totals: DailyMacroTotals = $state({ date, calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 });
	// Undefined until the first read completes. Without it the page renders its "nothing logged"
	// empty state for a beat on every visit, even when there is a full day of food in IndexedDB.
	let loaded = $state(false);
	let removed: LogEntry | undefined = $state();
	let removedTimer: ReturnType<typeof setTimeout> | undefined;

	const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	// A target/goal feature (e.g. "is 1800 a lot?") would be device-only per CLAUDE.md's
	// data-residency table; deliberately not built here. The per-macro % of calories this page and
	// the home dashboard both show is the cheap honest substitute — see macroShares.ts.
	const breakdown = $derived(macroCalorieBreakdown(totals));

	function entryName(entry: LogEntry): string {
		return entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName;
	}

	function loggedTime(entry: LogEntry): string {
		return new Date(entry.loggedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	}

	async function refresh() {
		if (!storage) return;
		// getEntriesForDate returns IndexedDB's own key order, which isn't chronological — the list
		// rendered as an arbitrary shuffle of the day. A food diary reads breakfast-to-dinner.
		entries = (await storage.getEntriesForDate(date)).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
		totals = computeDailyTotals(date, entries);
		loaded = true;
	}

	onMount(() => {
		storage = new IndexedDbLogStorage();
		rankingStorage = new IndexedDbRankingStorage();
		favoritesStorage = new IndexedDbFavoritesStorage();
		refresh();
	});

	function download(content: string, filename: string, mime: string) {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function exportJson() {
		if (!storage) return;
		const all = await storage.getAllEntries();
		download(exportEntriesAsJson(all), "udine-log.json", "application/json");
	}

	// #148: the log's exporters above have twins for the other two always-device-local stores
	// (CLAUDE.md's data-residency table) -- ranking (rankedDishes/rankedFoods) and favorites. Each
	// gets its own JSON+CSV pair, same shape as the log's, rather than merging heterogeneous tables
	// into one file.
	async function exportRankedDishesJson() {
		if (!rankingStorage) return;
		download(exportRankedDishesAsJson(await rankingStorage.getRankedDishes()), "udine-ranked-dishes.json", "application/json");
	}

	async function exportRankedDishesCsv() {
		if (!rankingStorage) return;
		download(exportRankedDishesAsCsv(await rankingStorage.getRankedDishes()), "udine-ranked-dishes.csv", "text/csv");
	}

	async function exportRankedFoodsJson() {
		if (!rankingStorage) return;
		download(exportRankedFoodsAsJson(await rankingStorage.getRankedFoods()), "udine-ranked-foods.json", "application/json");
	}

	async function exportRankedFoodsCsv() {
		if (!rankingStorage) return;
		download(exportRankedFoodsAsCsv(await rankingStorage.getRankedFoods()), "udine-ranked-foods.csv", "text/csv");
	}

	async function exportFavoritesJson() {
		if (!favoritesStorage) return;
		download(exportFavoritesAsJson(await favoritesStorage.getFavorites()), "udine-favorites.json", "application/json");
	}

	async function exportFavoritesCsv() {
		if (!favoritesStorage) return;
		download(exportFavoritesAsCsv(await favoritesStorage.getFavorites()), "udine-favorites.csv", "text/csv");
	}

	async function exportCsv() {
		if (!storage) return;
		const all = await storage.getAllEntries();
		download(exportEntriesAsCsv(all), "udine-log.csv", "text/csv");
	}

	// Remove is destructive and one click away, with no confirm step. Rather than adding a modal for
	// something this small, keep the entry around and offer an undo — the entry is a plain object and
	// addEntry() is keyed on its own id, so putting it back is exact, not a reconstruction.
	async function removeEntry(entry: LogEntry) {
		if (!storage) return;
		await storage.removeEntry(entry.id);
		await refresh();
		removed = entry;
		clearTimeout(removedTimer);
		removedTimer = setTimeout(() => (removed = undefined), 8000);
	}

	async function undoRemove() {
		if (!storage || !removed) return;
		await storage.addEntry($state.snapshot(removed));
		removed = undefined;
		clearTimeout(removedTimer);
		await refresh();
	}
</script>

<header>
	<h1 class="page-title">Today &mdash; {dateLabel}</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
</header>

<section class="card mt-6 px-5 py-5">
	<MacroStats {totals} entryCount={entries.length} />

	{#if breakdown.total > 0}
		<div class="mt-5 flex h-2 overflow-hidden rounded-sm" aria-hidden="true">
			<div class="bg-maroon-900" style="width: {breakdown.shares.protein}%"></div>
			<div class="bg-maroon-600" style="width: {breakdown.shares.carbs}%"></div>
			<div class="bg-gold-500" style="width: {breakdown.shares.fat}%"></div>
		</div>
		<p class="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-900/60">
			<span><span class="mr-1 inline-block size-2 rounded-xs bg-maroon-900 align-middle"></span>Protein</span>
			<span><span class="mr-1 inline-block size-2 rounded-xs bg-maroon-600 align-middle"></span>Carbs</span>
			<span><span class="mr-1 inline-block size-2 rounded-xs bg-gold-500 align-middle"></span>Fat</span>
		</p>
	{/if}
</section>

<section class="mt-8">
	<h2 class="section-title">Logged today</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if loaded && entries.length === 0}
		<div class="empty-state mt-4">
			<p class="font-display text-lg uppercase">Nothing logged yet.</p>
			<p class="mt-2 text-sm">Browse a dining hall menu and press Log on anything you eat.</p>
			<!-- Not "Browse dining halls": getByRole name matching is case-insensitive substring, so that
			     label collides with the nav's "Dining Halls" link and makes every spec that clicks it
			     ambiguous the moment this empty state is on screen. -->
			<p class="mt-4"><a href="/" class="btn btn-primary no-underline">Find something to eat</a></p>
		</div>
	{:else}
		<ul class="mt-3 flex flex-col gap-2">
			{#each entries as entry (entry.id)}
				<li class="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
					<div class="min-w-0 flex-1">
						<p class="font-display text-base font-semibold text-maroon-900">
							{entryName(entry)} &times; {entry.servings}
						</p>
						<p class="font-mono text-xs text-ink-900/60">
							{Math.round(entry.nutrition.calories * entry.servings)} cal
							<span class="text-ink-900/35">·</span>
							{(entry.nutrition.proteinG * entry.servings).toFixed(1)}g protein
							<span class="text-ink-900/35">·</span>
							logged {loggedTime(entry)}
						</p>
					</div>
					<button onclick={() => removeEntry(entry)} class="btn btn-ghost btn-sm">Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-8">
	<h2 class="section-title">Export your data</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	<p class="mt-3 max-w-prose text-sm text-ink-900/70">
		Everything this browser has stored &mdash; food log, dish rankings, favorites &mdash; downloaded
		straight from it. Nothing is uploaded to do it.
	</p>

	<h3 class="mt-4 font-display text-sm uppercase text-ink-900/70">Food log</h3>
	<div class="mt-2 flex flex-wrap gap-3">
		<button onclick={exportJson} class="btn btn-secondary">Export JSON (all history)</button>
		<button onclick={exportCsv} class="btn btn-secondary">Export CSV (all history)</button>
	</div>

	<h3 class="mt-4 font-display text-sm uppercase text-ink-900/70">Dish rankings</h3>
	<div class="mt-2 flex flex-wrap gap-3">
		<button onclick={exportRankedDishesJson} class="btn btn-secondary">Rankings JSON</button>
		<button onclick={exportRankedDishesCsv} class="btn btn-secondary">Rankings CSV</button>
	</div>

	<h3 class="mt-4 font-display text-sm uppercase text-ink-900/70">Favorite foods (cross-hall)</h3>
	<div class="mt-2 flex flex-wrap gap-3">
		<button onclick={exportRankedFoodsJson} class="btn btn-secondary">Favorite Foods JSON</button>
		<button onclick={exportRankedFoodsCsv} class="btn btn-secondary">Favorite Foods CSV</button>
	</div>

	<h3 class="mt-4 font-display text-sm uppercase text-ink-900/70">Favorites</h3>
	<div class="mt-2 flex flex-wrap gap-3">
		<button onclick={exportFavoritesJson} class="btn btn-secondary">Favorites JSON</button>
		<button onclick={exportFavoritesCsv} class="btn btn-secondary">Favorites CSV</button>
	</div>
</section>

{#if removed}
	<div
		role="status"
		class="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md bg-maroon-900 px-4 py-2 text-sm text-paper-50 shadow-lg"
	>
		<span>Removed {entryName(removed)}</span>
		<button onclick={undoRemove} class="font-semibold text-gold-500 underline">Undo</button>
	</div>
{/if}
