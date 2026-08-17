<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { applyComparison, DINING_HALLS, favoriteDiningHalls, rankDishes, type LogEntry, type RankedDish } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbRankingStorage } from "$lib/rankingStorage";
	import { syncFavoriteHalls } from "$lib/syncFavoriteHalls";

	type Dish = { dishName: string; hallTid: number };

	const logStorage = new IndexedDbLogStorage();
	const rankingStorage = new IndexedDbRankingStorage();

	let loggedDishes: Dish[] = $state([]);
	let rankedDishes: RankedDish[] = $state([]);
	let pair: [Dish, Dish] | null = $state(null);

	function hallName(hallTid: number): string {
		return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
	}

	function dishKey(d: Dish): string {
		return `${d.dishName}::${d.hallTid}`;
	}

	function pickPair(): [Dish, Dish] | null {
		if (loggedDishes.length < 2) return null;
		const a = loggedDishes[Math.floor(Math.random() * loggedDishes.length)];
		let b = a;
		while (dishKey(b) === dishKey(a)) {
			b = loggedDishes[Math.floor(Math.random() * loggedDishes.length)];
		}
		return [a, b];
	}

	async function refresh() {
		const entries: LogEntry[] = await logStorage.getAllEntries();
		const seen = new Set<string>();
		loggedDishes = [];
		for (const entry of entries) {
			if (entry.source.type !== "umass-menu") continue;
			const dish = { dishName: entry.source.dishName, hallTid: entry.source.hallTid };
			const key = dishKey(dish);
			if (seen.has(key)) continue;
			seen.add(key);
			loggedDishes.push(dish);
		}
		rankedDishes = await rankingStorage.getRankedDishes();
		pair = pickPair();
	}

	onMount(refresh);

	async function choose(winner: Dish, loser: Dish) {
		rankedDishes = applyComparison(rankedDishes, winner, loser);
		// $state arrays are deep-proxied by Svelte on assignment; IndexedDB's structured-clone can't
		// serialize a Proxy (DataCloneError), so snapshot to a plain object before persisting.
		const snapshot = $state.snapshot(rankedDishes);
		await rankingStorage.saveRankedDishes(snapshot);

		const session = page.data.session;
		if (session && page.data.supabase) {
			await syncFavoriteHalls(page.data.supabase, session.user.id, snapshot);
		}

		pair = pickPair();
	}

	function skip() {
		pair = pickPair();
	}
</script>

<a href="/">&larr; Dining Halls</a>
<h1>Rank Dishes</h1>
<p>Compare dishes you've actually logged &mdash; ranking is built from what you've eaten, not the full menu.</p>

{#if loggedDishes.length < 2}
	<p>Log a couple of meals first, then come back here to rank them.</p>
{:else if pair}
	<h2>Which did you like more?</h2>
	<button onclick={() => choose(pair![0], pair![1])}>
		{pair[0].dishName} <small>({hallName(pair[0].hallTid)})</small>
	</button>
	<button onclick={() => choose(pair![1], pair![0])}>
		{pair[1].dishName} <small>({hallName(pair[1].hallTid)})</small>
	</button>
	<button onclick={skip}>Skip</button>
{/if}

<h2>Your ranking</h2>
{#if rankedDishes.length === 0}
	<p>No comparisons yet.</p>
{:else}
	<ol>
		{#each rankDishes(rankedDishes) as dish (dishKey(dish))}
			<li>{dish.dishName} <small>({hallName(dish.hallTid)}) &mdash; {Math.round(dish.rating)}</small></li>
		{/each}
	</ol>
{/if}

<h2>Favorite dining halls {page.data.session ? "(synced)" : "(local only — sign in to sync)"}</h2>
{#if favoriteDiningHalls(rankedDishes).length === 0}
	<p>Not enough ranked dishes per hall yet.</p>
{:else}
	<ol>
		{#each favoriteDiningHalls(rankedDishes) as fav (fav.hallTid)}
			<li>{hallName(fav.hallTid)}</li>
		{/each}
	</ol>
{/if}
