<script lang="ts">
	import { onMount } from "svelte";
	import { computeDailyTotals, exportEntriesAsCsv, exportEntriesAsJson, type DailyMacroTotals, type LogEntry } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { todayIso } from "$lib/date";

	// IndexedDB only exists in the browser — this page has no SSR-safe data to render on
	// its own, so the storage instance and the initial load both wait for the client.
	let storage: IndexedDbLogStorage | undefined;
	const date = todayIso();

	let entries: LogEntry[] = $state([]);
	let totals: DailyMacroTotals = $state({ date, calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 });

	async function refresh() {
		if (!storage) return;
		entries = await storage.getEntriesForDate(date);
		totals = computeDailyTotals(date, entries);
	}

	onMount(() => {
		storage = new IndexedDbLogStorage();
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

	async function exportCsv() {
		if (!storage) return;
		const all = await storage.getAllEntries();
		download(exportEntriesAsCsv(all), "udine-log.csv", "text/csv");
	}

	async function removeEntry(id: string) {
		if (!storage) return;
		await storage.removeEntry(id);
		await refresh();
	}
</script>

<a href="/">&larr; Dining Halls</a>
<h1>Today &mdash; {date}</h1>

<ul>
	<li>Calories: {totals.calories}</li>
	<li>Protein: {totals.proteinG.toFixed(1)}g</li>
	<li>Carbs: {totals.totalCarbG.toFixed(1)}g</li>
	<li>Fat: {totals.totalFatG.toFixed(1)}g</li>
</ul>

<button onclick={exportJson}>Export JSON (all history)</button>
<button onclick={exportCsv}>Export CSV (all history)</button>

<h2>Logged today</h2>
{#if entries.length === 0}
	<p>Nothing logged yet.</p>
{/if}
<ul>
	{#each entries as entry (entry.id)}
		<li>
			{entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName}
			&times; {entry.servings}
			<button onclick={() => removeEntry(entry.id)}>Remove</button>
		</li>
	{/each}
</ul>
