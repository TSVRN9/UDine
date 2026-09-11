<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import {
		applyComparison,
		applyFoodComparison,
		hallNameFor,
		MEAL_PERIODS,
		menuItemMatchesPreferences,
		nowLocalIso,
		pickPostLogComparisonPair,
		syncDiningHallRanks,
		type Favorite,
		type FoodPreferences,
		type LogEntry,
		type LoggedDish,
		type MenuItem,
	} from "@udine/shared";
	import { favoriteKey } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { IndexedDbRankingStorage } from "$lib/rankingStorage";
	import { loadPreferences } from "$lib/preferences";
	import { addDaysIso, todayIso } from "$lib/date";
	import DishList from "$lib/DishList.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const favoritesStorage = new IndexedDbFavoritesStorage();
	const rankingStorage = new IndexedDbRankingStorage();

	let servings: Record<string, number> = $state({});
	let loggedMessage = $state("");
	let prefs: FoodPreferences = $state({ allergensToAvoid: [], requiredDietTags: [] });
	let favoriteDishKeys: Set<string> = $state(new Set());
	// Post-log comparison prompt. Dismissible, never modal-blocking -- logging another dish works
	// exactly the same whether this is showing or not. Pair selection lives in @udine/shared
	// (pickPostLogComparisonPair); this page only wires it to IndexedDB reads and the
	// applyComparison/applyFoodComparison write-back.
	let comparePrompt: [LoggedDish, LoggedDish] | null = $state(null);
	// Set when an IndexedDB read/write fails below, so the favorite-star toggle and log-a-dish
	// writes don't just silently no-op on a blocked/failed open.
	let dbError = $state(false);
	// The bottom-anchored toast/prompt stack's own rendered height, tracked via bind:clientHeight
	// below (a ResizeObserver, kept current with no manual effect needed). Sizes the narrow-viewport
	// spacer that reserves clearance for the last dish row's Log button.
	let stackHeight = $state(0);

	const dateLabel = $derived(
		new Date(`${data.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
	);
	// Recomputed client-side (not just trusted from the loader) so a future-dated deep link
	// still gets an accurate prev/empty-state decision after hydration.
	const isToday = $derived(data.date === todayIso());
	// Neutral wording so the filter-banner/empty-state copy still reads correctly when browsing a
	// future day (not just "today's menu").
	const menuPossessive = $derived(isToday ? "today’s" : "this day’s");

	function goToDate(dateIso: string) {
		// keepFocus: without it SvelteKit moves focus to <body> on every click, dropping a keyboard
		// user off the date-nav button they just pressed.
		goto(`?date=${dateIso}`, { keepFocus: true });
	}

	// How many dishes the user's own filters are removing, so the page doesn't just quietly show
	// fewer dishes and look like UMass posted nothing.
	const hiddenCount = $derived(data.items.filter((i) => !menuItemMatchesPreferences(i, prefs)).length);

	// A same-route ?date= nav swaps `data.items` without remounting, so seeding must react to
	// `data.items` itself, not run once in onMount, or a new day's dishes never get a default
	// `servings` entry. Existence check (`in`), not `??=`: clearing the input leaves `null` behind
	// (see logItem's comment), and `??=` would stomp that back to 1 out from under a user actively
	// clearing the field.
	$effect(() => {
		for (const item of data.items) if (!(item.dishName in servings)) servings[item.dishName] = 1;
	});

	onMount(async () => {
		prefs = loadPreferences();
		try {
			const favorites = await favoritesStorage.getFavorites();
			favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
		} catch {
			dbError = true;
		}
	});

	// Whole body in one try/catch, not just the write -- catching only the write and still
	// unconditionally re-reading would let a succeeding read reset dbError right after it was set.
	async function toggleFavoriteDish(dishName: string) {
		const favorite: Favorite = { type: "dish", dishName };
		const key = favoriteKey(favorite);
		try {
			if (favoriteDishKeys.has(key)) {
				await favoritesStorage.removeFavorite(favorite);
			} else {
				await favoritesStorage.addFavorite(favorite);
			}
			const favorites = await favoritesStorage.getFavorites();
			favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
		} catch {
			dbError = true;
		}
	}

	async function logItem(item: MenuItem) {
		// Clearing the number input leaves null behind (Svelte's number binding maps "" to null,
		// never NaN); fall back to a single serving for that and any other non-numeric state.
		const qty = Number(servings[item.dishName]) || 1;
		const entry: LogEntry = {
			id: crypto.randomUUID(),
			// Local-date-prefixed, not `.toISOString()` (UTC): readers bucket loggedAt by the LOCAL
			// calendar day (indexedDbStorage.ts's getEntriesForDate), so a UTC stamp filed evening
			// entries under tomorrow and made them vanish from Today.
			loggedAt: nowLocalIso(),
			source: { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid },
			servings: qty,
			nutrition: item.nutrition
		};
		try {
			await storage.addEntry(entry);
		} catch {
			dbError = true;
			return;
		}
		loggedMessage = `Logged ${qty} × ${item.dishName}`;
		setTimeout(() => (loggedMessage = ""), 2000);

		// Offer a one-tap comparison against another logged dish, if a valid pair exists. Best-effort:
		// the log itself already succeeded, so a failed read here just means no comparison prompt,
		// not a broken log.
		try {
			const allEntries = await storage.getAllEntries();
			const rankedDishes = await rankingStorage.getRankedDishes();
			comparePrompt = pickPostLogComparisonPair(allEntries, { dishName: item.dishName, hallTid: item.hallTid }, rankedDishes);
		} catch {
			// no-op -- best-effort, see comment above
		}
	}

	// Updates both Elo tracks (RankedDish + RankedFood), same as /rank's own choose() -- see ADR 0001's
	// Consequences clause, which requires any code reacting to a Pairwise Comparison to touch both
	// tracks or justify touching only one. Also syncs favorite dining halls when a session exists,
	// same as /rank's choose() -- per CLAUDE.md's data residency table, favorite dining halls (coarse,
	// hall-level) are the one ranking-derived thing the server may see for a signed-in user.
	// Whole body in one try/catch: a failed save must not clear comparePrompt and claim the
	// comparison went through.
	async function chooseCompare(winner: LoggedDish, loser: LoggedDish) {
		try {
			const rankedDishes = applyComparison(await rankingStorage.getRankedDishes(), winner, loser);
			const rankedFoods = applyFoodComparison(await rankingStorage.getRankedFoods(), winner, loser);
			await rankingStorage.saveRankedDishes(rankedDishes);
			await rankingStorage.saveRankedFoods(rankedFoods);

			const session = page.data.session;
			if (session && page.data.supabase) {
				// Fire-and-forget: don't block dismissing the prompt on the network round-trip.
				// syncDiningHallRanks catches and logs its own failures, so nothing to .catch() here.
				void syncDiningHallRanks(page.data.supabase, session.user.id, rankedDishes);
			}
		} catch {
			dbError = true;
			return;
		}
		comparePrompt = null;
	}

	function dismissComparePrompt() {
		comparePrompt = null;
	}
</script>

<header>
	<p class="font-mono text-xs tracking-widest text-ink-900/50 uppercase">
		<!-- "All halls", not "Dining Halls": the nav link already uses that exact name, and two
		     matching link names on one page is a strict-mode violation for role-based e2e queries. -->
		<a href="/" class="no-underline hover:underline">All halls</a> / {dateLabel}
	</p>
	<h1 class="page-title mt-1">{data.hall.name}</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
</header>

{#if dbError}
	<p role="alert" class="badge mt-4">
		Couldn't save — try closing other UDine tabs and reloading this page.
	</p>
{/if}

<!-- No past nav (API has no history) and no forward cap (UMass's publish window rolls and isn't
     hardcoded here; an out-of-window day just renders the empty state instead of disabling Next). -->
<nav class="mt-4 flex flex-wrap items-center gap-2" aria-label="Menu date">
	<button class="btn btn-secondary btn-sm" disabled={isToday} onclick={() => goToDate(addDaysIso(data.date, -1))}>
		&lsaquo; Prev day
	</button>
	<button class="btn btn-ghost btn-sm" disabled={isToday} onclick={() => goToDate(todayIso())}>Today</button>
	<button class="btn btn-secondary btn-sm" onclick={() => goToDate(addDaysIso(data.date, 1))}>Next day &rsaquo;</button>
</nav>

{#if hiddenCount > 0 && hiddenCount < data.items.length}
	<p class="mt-4 rounded-md border border-gold-500/50 bg-gold-500/10 px-4 py-3 text-sm">
		Your dietary filters are hiding {hiddenCount}
		{hiddenCount === 1 ? "dish" : "dishes"} on {menuPossessive} menu.
		<a href="/filters" class="font-semibold">Edit dietary preferences</a>
	</p>
{/if}

{#if data.items.length === 0}
	<div class="empty-state mt-6">
		{#if isToday}
			<p class="font-display text-lg uppercase">No menu posted for today.</p>
			<p class="mt-2 text-sm">
				UMass Dining hasn&rsquo;t published {data.hall.name}&rsquo;s menu for {dateLabel} yet. It usually
				appears the morning of.
			</p>
			<p class="mt-4"><a href="/" class="btn btn-secondary no-underline">Try another hall</a></p>
		{:else}
			<!-- A future day outside UMass's publish window also comes back as `[]` -- distinct copy
			     from the today case, since "hasn't published yet" reads as broken here. -->
			<p class="font-display text-lg uppercase">Not posted yet</p>
			<p class="mt-2 text-sm">Menu not posted yet &mdash; UMass publishes about two weeks ahead.</p>
			<p class="mt-4">
				<button class="btn btn-secondary" onclick={() => goToDate(todayIso())}>Back to today</button>
			</p>
		{/if}
	</div>
{:else if hiddenCount === data.items.length}
	<!-- A menu exists but the user's own filters removed all of it -- distinct from UMass posting no menu. -->
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">Everything is filtered out</p>
		<p class="mt-2 text-sm">
			All {data.items.length} dishes on {menuPossessive} menu conflict with your dietary filters.
		</p>
		<p class="mt-4"><a href="/filters" class="btn btn-secondary no-underline">Edit dietary preferences</a></p>
	</div>
{/if}

<DishList
	items={data.items}
	periods={MEAL_PERIODS}
	{prefs}
	{favoriteDishKeys}
	{servings}
	onToggleFavorite={toggleFavoriteDish}
	onLog={logItem}
/>

<!-- Reserves clearance below the last dish row for the bottom-anchored stack, at narrow widths only
     (sm:hidden -- at >=640px the stack is 28rem against a much wider list, so desktop is unaffected).
     Below that, the stack's min(92vw, 28rem) width nearly fills the screen and would otherwise sit on
     top of the last row's Log button. stackHeight (bind:clientHeight below) tracks the stack's
     rendered height reactively. The spacer collapses to 0 once the stack is gone, so bottom padding
     equal to the stack height is the tradeoff: a user already at the document bottom scrolls roughly
     one stack-height further when the prompt appears, via Chrome's scroll anchoring.
     ponytail: +20 duplicates the wrapper's own `bottom-5` (1.25rem) instead of a shared source --
     fine with only one bottom-anchored offset in this file; extract a CSS var if a second one appears. -->
<div aria-hidden="true" class="sm:hidden" style="height: {stackHeight > 0 ? stackHeight + 20 : 0}px"></div>

<!-- Fixed to the viewport bottom rather than inline in document flow: a menu runs to a few hundred
     dishes, so anything rendered above the fold is invisible at the moment you press Log. Status
     toast and comparison prompt share one bottom-anchored, flex-col-reverse stack (toast markup
     first, prompt second) so whichever is showing lands at the very bottom and the other stacks
     above it without a hardcoded pixel gap, even when both are visible at once. The wrapper is
     pointer-events-none (spans the full width) so it never intercepts clicks behind it; each child
     re-enables pointer-events for its own bounds. Single role="status" region on this page by design. -->
<div bind:clientHeight={stackHeight} class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex flex-col-reverse items-center gap-2 px-4">
	{#if loggedMessage}
		<p
			role="status"
			class="pointer-events-auto rounded-md bg-maroon-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-lg"
		>
			{loggedMessage}
		</p>
	{/if}

	<!-- Deliberately not role="status": this isn't a passive announcement, it's an interactive prompt. -->
	{#if comparePrompt}
		<section aria-label="Compare dishes" class="card pointer-events-auto w-[min(92vw,28rem)] px-4 py-3">
			<div class="flex items-start justify-between gap-3">
				<p class="font-display text-sm tracking-wide text-maroon-900 uppercase">Which did you like more?</p>
				<button
					onclick={dismissComparePrompt}
					aria-label="Dismiss comparison prompt"
					class="shrink-0 text-lg leading-none text-ink-900/40 hover:text-ink-900"
				>
					&times;
				</button>
			</div>
			<div class="mt-2 flex flex-col gap-2 sm:flex-row">
				{#each [comparePrompt[0], comparePrompt[1]] as choice, i (choice.dishName + '::' + choice.hallTid)}
					<button
						onclick={() => chooseCompare(choice, comparePrompt![1 - i])}
						class="flex-1 cursor-pointer rounded-sm border border-maroon-900/25 px-3 py-2 text-left transition-colors hover:border-gold-500 hover:bg-gold-500/10"
					>
						<span class="block text-sm font-semibold text-maroon-900">{choice.dishName}</span>
						<span class="badge mt-1">{hallNameFor(choice.hallTid)}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>
