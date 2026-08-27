<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import {
		applyComparison,
		applyFoodComparison,
		hallNameFor,
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
	// With only two logged dishes pickPair() legitimately returns the same pair every time, so
	// choosing a winner changes nothing on screen above the fold and the tap reads as a dead click.
	// This line is the acknowledgement.
	let lastChoice = $state("");

	// Each comparison bumps comparisonCount on both dishes, so the sum double-counts.
	const comparisonsMade = $derived(Math.round(rankedDishes.reduce((sum, d) => sum + d.comparisonCount, 0) / 2));

	// #322: set when an IndexedDB read/write here fails (issue #193's bug class -- e.g. a blocked
	// open from a stale pre-deploy tab). Without this, refresh()/choose() rejections were unhandled
	// and this page just silently no-op'd instead of telling the user anything was wrong.
	let dbError = $state(false);

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
		try {
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
			dbError = false;
		} catch {
			dbError = true;
		}
	}

	onMount(refresh);

	// #322: the persisting write runs BEFORE rankedDishes/rankedFoods/lastChoice/pair are ever
	// touched, using local variables (applyComparison/applyFoodComparison are pure, so calling them
	// against the still-unmodified $state arrays is safe) -- a failed save must not advance to the
	// next pair or claim "Recorded: X over Y" for a comparison that was never actually persisted.
	async function choose(winner: Dish, loser: Dish) {
		const newRankedDishes = applyComparison(rankedDishes, winner, loser);
		const newRankedFoods = applyFoodComparison(rankedFoods, winner, loser);
		// $state arrays are deep-proxied by Svelte on assignment; IndexedDB's structured-clone can't
		// serialize a Proxy (DataCloneError), so snapshot to a plain object before persisting.
		const snapshot = $state.snapshot(newRankedDishes);
		const foodSnapshot = $state.snapshot(newRankedFoods);
		try {
			await rankingStorage.saveRankedDishes(snapshot);
			await rankingStorage.saveRankedFoods(foodSnapshot);
		} catch {
			dbError = true;
			return;
		}
		rankedDishes = newRankedDishes;
		rankedFoods = newRankedFoods;

		const session = page.data.session;
		if (session && page.data.supabase) {
			// Fire-and-forget: don't block advancing to the next pair on the network round-trip.
			// syncDiningHallRanks catches and logs its own failures, so nothing to .catch() here.
			void syncDiningHallRanks(page.data.supabase, session.user.id, snapshot);
		}

		lastChoice = `${winner.dishName} over ${loser.dishName}`;
		pair = pickPair();
	}

	function skip() {
		lastChoice = "";
		pair = pickPair();
	}
</script>

<header>
	<h1 class="page-title">Rank Dishes</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">
		Compare dishes you&rsquo;ve actually logged &mdash; ranking is built from what you&rsquo;ve eaten, not
		the full menu. Every comparison stays on this device.
	</p>
</header>

{#if dbError}
	<p role="alert" class="badge mt-4">
		Couldn't save your comparison — try closing other UDine tabs and reloading this page.
	</p>
{/if}

{#if loggedDishes.length < 2}
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">Nothing to compare yet</p>
		<p class="mt-2 text-sm">
			Ranking needs at least two different dishes in your log. You have {loggedDishes.length}.
			Log a couple of meals first, then come back here to rank them.
		</p>
		<p class="mt-4"><a href="/" class="btn btn-primary no-underline">Find something to eat</a></p>
	</div>
{:else if pair}
	<!-- The focal point of the page: a full-width panel in the header colours, with the two choices as
	     large equal-weight cards and Skip deliberately demoted to a ghost button underneath. -->
	<section class="mt-6 rounded-md bg-maroon-900 px-5 py-6 text-paper-50 sm:px-8 sm:py-8">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-center font-display text-xl tracking-wide text-paper-50 uppercase sm:text-2xl">
				Which did you like more?
			</h2>
			<span class="font-mono text-xs tracking-widest text-paper-50/60 uppercase">
				{comparisonsMade}
				{comparisonsMade === 1 ? "comparison" : "comparisons"} so far
			</span>
		</div>
		<div class="label-rule mt-2 text-gold-500"></div>

		<div class="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
			{#each [pair[0], pair[1]] as choice, i (dishKey(choice))}
				{#if i === 1}
					<span aria-hidden="true" class="self-center font-display text-sm tracking-widest text-gold-500 uppercase">
						vs
					</span>
				{/if}
				<button
					onclick={() => choose(choice, pair![1 - i])}
					class="flex-1 cursor-pointer rounded-md border-2 border-paper-50/25 bg-paper-50/5 px-5 py-6 text-left transition-colors hover:border-gold-500 hover:bg-paper-50/10"
				>
					<span class="block font-display text-xl leading-tight font-semibold text-paper-50">
						{choice.dishName}
					</span>
					<span class="mt-1 block font-mono text-xs tracking-widest text-gold-500 uppercase">
						{hallNameFor(choice.hallTid)}
					</span>
				</button>
			{/each}
		</div>

		<div class="mt-5 flex flex-wrap items-center justify-between gap-3">
			<button onclick={skip} class="btn btn-ghost text-paper-50/70 hover:bg-paper-50/10 hover:text-paper-50">
				Skip this pair
			</button>
			<!-- Not a button, on purpose: rank.spec.ts locates the choice buttons with
			     getByRole("button", { name: /French Toast/ }), and a second button carrying a dish name
			     would make that ambiguous. -->
			<p role="status" class="font-mono text-xs text-gold-500">
				{#if lastChoice}Recorded: {lastChoice}{/if}
			</p>
		</div>
	</section>
{/if}

<!-- The three lists below are reference output. Each <ol>/<ul> must stay a DIRECT sibling of its own
     <h2> with no wrapper in between: rank.spec.ts locates them by nearest-preceding-h2 xpath. The
     empty branches must stay a <p>, not an empty <ol>, for the same reason (it asserts count 0). -->
<section class="mt-10">
	<h2 class="section-title">Your ranking</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	{#if rankedDishes.length === 0}
		<p class="mt-3 text-sm text-ink-900/60">
			No comparisons yet &mdash; pick a winner above and your dishes start ordering themselves.
		</p>
	{:else}
		<ol class="mt-3 flex flex-col gap-1.5">
			{#each rankDishes(rankedDishes) as dish, i (dishKey(dish))}
				<li class="card flex items-center gap-3 px-4 py-2.5">
					<span class="w-7 shrink-0 font-display text-lg text-ink-900/35 tabular-nums">{i + 1}</span>
					<span class="min-w-0 flex-1 font-semibold">{dish.dishName}</span>
					<span class="badge">{hallNameFor(dish.hallTid)}</span>
					<span class="w-12 shrink-0 text-right font-mono text-sm text-ink-900/55">{Math.round(dish.rating)}</span>
				</li>
			{/each}
		</ol>
		<p class="mt-2 text-xs text-ink-900/50">
			The number on the right is a rating, not calories &mdash; it starts at 1000 and moves as you
			compare. Only the order matters.
		</p>
	{/if}
</section>

<section class="mt-10">
	<h2 class="section-title">Favorite Foods</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	<p class="mt-2 max-w-prose text-sm text-ink-900/60">
		Your favorite dishes by name, regardless of which hall serves them.
	</p>
	{#if rankedFoods.length === 0}
		<p class="mt-3 text-sm text-ink-900/60">No comparisons yet.</p>
	{:else}
		<ol class="mt-3 flex flex-col gap-1.5">
			{#each rankFoods(rankedFoods) as food, i (food.dishName)}
				<li class="card flex items-center gap-3 px-4 py-2.5">
					<span class="w-7 shrink-0 font-display text-lg text-ink-900/35 tabular-nums">{i + 1}</span>
					<span class="min-w-0 flex-1 font-semibold">{food.dishName}</span>
					<span class="w-12 shrink-0 text-right font-mono text-sm text-ink-900/55">{Math.round(food.rating)}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<section class="mt-10">
	<h2 class="section-title">
		Dining hall ranking {page.data.session ? "(synced)" : "(local only — sign in to sync)"}
	</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	<ol class="mt-3 flex flex-col gap-1.5">
		{#each hallRanking.ranked as hall, i (hall.hallTid)}
			<li class="card flex items-center gap-3 border-l-4 border-l-gold-500 px-4 py-3">
				<span class="w-7 shrink-0 font-display text-xl text-gold-500 tabular-nums">{i + 1}</span>
				<span class="font-display text-lg font-semibold text-maroon-900 uppercase">{hallNameFor(hall.hallTid)}</span>
			</li>
		{/each}
	</ol>
	{#if hallRanking.unranked.length > 0}
		<!-- Unranked halls are visually demoted rather than only carrying the words "not enough data
		     yet": no card surface, no rank number, dashed rule -- so the split reads at a glance. -->
		<ul class="mt-3 flex flex-col gap-1.5 border-t border-dashed border-ink-900/20 pt-3">
			{#each hallRanking.unranked as hall (hall.hallTid)}
				<li class="flex items-center gap-3 px-4 py-1.5 text-ink-900/55">
					<span aria-hidden="true" class="w-7 shrink-0 text-center font-display text-lg">&ndash;</span>
					<span class="font-display uppercase">{hallNameFor(hall.hallTid)}</span>
					<span class="text-xs">(not enough data yet)</span>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-xs text-ink-900/50">
			A hall needs at least 2 rated dishes before it can be placed.
		</p>
	{/if}
</section>
