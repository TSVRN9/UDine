<script lang="ts">
	import { onMount } from "svelte";
	import { menuItemMatchesPreferences, type Favorite, type FoodPreferences, type LogEntry, type MealPeriod, type MenuItem } from "@udine/shared";
	import { favoriteKey } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { loadPreferences } from "$lib/preferences";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const favoritesStorage = new IndexedDbFavoritesStorage();
	const mealPeriods: MealPeriod[] = ["breakfast", "lunch", "dinner"];

	let servings: Record<string, number> = $state({});
	let loggedMessage = $state("");
	let prefs: FoodPreferences = $state({ allergensToAvoid: [], requiredDietTags: [] });
	let favoriteDishKeys: Set<string> = $state(new Set());

	onMount(async () => {
		prefs = loadPreferences();
		const favorites = await favoritesStorage.getFavorites();
		favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
	});

	function itemsFor(period: MealPeriod): MenuItem[] {
		return data.items.filter((i) => i.mealPeriod === period && menuItemMatchesPreferences(i, prefs));
	}

	async function toggleFavoriteDish(dishName: string) {
		const favorite: Favorite = { type: "dish", dishName };
		const key = favoriteKey(favorite);
		if (favoriteDishKeys.has(key)) {
			await favoritesStorage.removeFavorite(favorite);
		} else {
			await favoritesStorage.addFavorite(favorite);
		}
		const favorites = await favoritesStorage.getFavorites();
		favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
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

<a href="/">&larr; Dining Halls</a> | <a href="/filters">Filters</a> | <a href="/favorites">Favorites</a>
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
					<button onclick={() => toggleFavoriteDish(item.dishName)} aria-label="favorite">
						{favoriteDishKeys.has(favoriteKey({ type: 'dish', dishName: item.dishName })) ? '★' : '☆'}
					</button>
					<strong>{item.dishName}</strong>
					({item.nutrition.calories} cal, {item.nutrition.proteinG}g protein)
					<input type="number" min="0.25" step="0.25" bind:value={servings[item.dishName]} placeholder="1" style="width:4em" />
					<button onclick={() => logItem(item)}>Log</button>
				</li>
			{/each}
		</ul>
	{/if}
{/each}
