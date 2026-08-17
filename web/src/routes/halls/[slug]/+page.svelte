<script lang="ts">
	import type { LogEntry, MealPeriod, MenuItem } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const mealPeriods: MealPeriod[] = ["breakfast", "lunch", "dinner"];

	let servings: Record<string, number> = $state({});
	let loggedMessage = $state("");

	function itemsFor(period: MealPeriod): MenuItem[] {
		return data.items.filter((i) => i.mealPeriod === period);
	}

	async function logItem(item: MenuItem) {
		const qty = servings[item.dishName] ?? 1;
		const entry: LogEntry = {
			id: crypto.randomUUID(),
			loggedAt: new Date().toISOString(),
			source: { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid },
			servings: qty,
			nutrition: item.nutrition
		};
		await storage.addEntry(entry);
		loggedMessage = `Logged ${qty} × ${item.dishName}`;
		setTimeout(() => (loggedMessage = ""), 2000);
	}
</script>

<a href="/">&larr; Dining Halls</a>
<h1>{data.hall.name} &mdash; {data.date}</h1>

{#if loggedMessage}<p role="status">{loggedMessage}</p>{/if}

{#if data.items.length === 0}
	<p>No menu posted for today.</p>
{/if}

{#each mealPeriods as period}
	{@const items = itemsFor(period)}
	{#if items.length > 0}
		<h2>{period}</h2>
		<ul>
			{#each items as item (item.dishName + item.category)}
				<li>
					<strong>{item.dishName}</strong>
					({item.nutrition.calories} cal, {item.nutrition.proteinG}g protein)
					<input type="number" min="0.25" step="0.25" bind:value={servings[item.dishName]} placeholder="1" style="width:4em" />
					<button onclick={() => logItem(item)}>Log</button>
				</li>
			{/each}
		</ul>
	{/if}
{/each}
