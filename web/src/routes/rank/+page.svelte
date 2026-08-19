<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import {
		applyComparison,
		applyFoodComparison,
		DINING_HALLS,
		rankDiningHalls,
		rankDishes,
		rankFoods,
		syncDiningHallRanks,
		type LogEntry,
		type RankedDish,
		type RankedFood,
	} from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbRankingStorage } from "$lib/rankingStorage";

	type Dish = { dishName: string; hallTid: number };

	const logStorage = new IndexedDbLogStorage();
	const rankingStorage = new IndexedDbRankingStorage();

	let loggedDishes: Dish[] = $state([]);
	let rankedDishes: RankedDish[] = $state([]);
	let rankedFoods: RankedFood[] = $state([]);
	let pair: [Dish, Dish] | null = $state(null);
	let hallRanking = $derived(rankDiningHalls(rankedDishes));
	let lastPair: [Dish, Dish] | null = null;

	function hallName(hallTid: number): string {
		return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
	}

	function dishKey(d: Dish): string {
		return `${d.dishName}::${d.hallTid}`;
	}

	function comparisonCountFor(d: Dish): number {
		return rankedDishes.find((r) => dishKey(r) === dishKey(d))?.comparisonCount ?? 0;
	}

	// Sample a couple of candidates and keep the least-compared one, instead of pure uniform
	// random, so under-compared dishes surface more often.
	function pickLeastCompared(pool: Dish[]): Dish {
		let best = pool[Math.floor(Math.random() * pool.length)];
		for (let i = 0; i < 2; i++) {
			const candidate = pool[Math.floor(Math.random() * pool.length)];
			if (comparisonCountFor(candidate) < comparisonCountFor(best)) best = candidate;
		}
		return best;
	}

	function samePair(p: [Dish, Dish], other: [Dish, Dish]): boolean {
		const [a, b] = [dishKey(p[0]), dishKey(p[1])];
		const [x, y] = [dishKey(other[0]), dishKey(other[1])];
		return (a === x && b === y) || (a === y && b === x);
	}

	function pickPair(): [Dish, Dish] | null {
		if (loggedDishes.length < 2) return null;
		let candidate: [Dish, Dish];
		do {
			const a = pickLeastCompared(loggedDishes);
			let b = a;
			while (dishKey(b) === dishKey(a)) {
				b = pickLeastCompared(loggedDishes);
			}
			candidate = [a, b];
		} while (loggedDishes.length > 2 && lastPair && samePair(candidate, lastPair));
		lastPair = candidate;
		return candidate;
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
		rankedFoods = await rankingStorage.getRankedFoods();
		pair = pickPair();
	}

	onMount(refresh);

	async function choose(winner: Dish, loser: Dish) {
		rankedDishes = applyComparison(rankedDishes, winner, loser);
		rankedFoods = applyFoodComparison(rankedFoods, winner, loser);
		// $state arrays are deep-proxied by Svelte on assignment; IndexedDB's structured-clone can't
		// serialize a Proxy (DataCloneError), so snapshot to a plain object before persisting.
		const snapshot = $state.snapshot(rankedDishes);
		const foodSnapshot = $state.snapshot(rankedFoods);
		await rankingStorage.saveRankedDishes(snapshot);
		await rankingStorage.saveRankedFoods(foodSnapshot);

		const session = page.data.session;
		if (session && page.data.supabase) {
			// Fire-and-forget: don't block advancing to the next pair on the network round-trip.
			// syncDiningHallRanks catches and logs its own failures, so nothing to .catch() here.
			void syncDiningHallRanks(page.data.supabase, session.user.id, snapshot);
		}

		pair = pickPair();
	}

	function skip() {
		pair = pickPair();
	}
</script>

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

<h2>Favorite Foods</h2>
<p><small>Your favorite dishes by name, regardless of which hall serves them.</small></p>
{#if rankedFoods.length === 0}
	<p>No comparisons yet.</p>
{:else}
	<ol>
		{#each rankFoods(rankedFoods) as food (food.dishName)}
			<li>{food.dishName} <small>&mdash; {Math.round(food.rating)}</small></li>
		{/each}
	</ol>
{/if}

<h2>Dining hall ranking {page.data.session ? "(synced)" : "(local only — sign in to sync)"}</h2>
<ol>
	{#each hallRanking.ranked as hall (hall.hallTid)}
		<li>{hallName(hall.hallTid)}</li>
	{/each}
</ol>
{#if hallRanking.unranked.length > 0}
	<ul>
		{#each hallRanking.unranked as hall (hall.hallTid)}
			<li>{hallName(hall.hallTid)} <small>(not enough data yet)</small></li>
		{/each}
	</ul>
{/if}
