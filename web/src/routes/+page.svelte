<script lang="ts">
	import { onMount } from "svelte";
	import { DINING_HALLS, computeDailyTotals, hallNameFor, isoDateOf, nowLocalIso, rankDishes, type DailyMacroTotals, type Favorite, type LogEntry, type RankedDish, type RetailLocationHours } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbRankingStorage } from "$lib/rankingStorage";
	import MacroStats from "$lib/MacroStats.svelte";
	import { dismissFirstRun, isFirstRunDismissed } from "$lib/firstRun";

	// #64 (web IA: Today-first home): `/` is now a dashboard — today's macro stats (device-local,
	// no auth, no server call — see CLAUDE.md's data-residency table), then the four halls as compact
	// cards, then quick links to Rank/Favorites. `/today` remains the full detail view (log list,
	// split bar, exports); this page only reads today's slice of the same IndexedDB log, via the same
	// computeDailyTotals + MacroStats this repo already uses there, not a re-derivation of its own.
	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favoriteHallTids: Set<number> = $state(new Set());

	// #178: café-tap parity's "Cafés & Markets" section. Deliberately fetched client-side in
	// onMount, NOT via a `+page.ts` server `load` -- this page's whole point (see the comment above)
	// is zero server calls during its own SSR/hydration, and every existing e2e spec navigates here
	// first (page.goto("/")) before mocking anything else; a load-level fetch would make that initial
	// hit go straight to the real umassdining.com on every single spec in the suite, not just this
	// feature's own tests. A plain post-hydration fetch is a real browser request instead, and Vite's
	// dev server still lets Playwright's page.route() intercept it (see the load-fetch caveat
	// documented in halls-menu.spec.ts, which only applies to `load`-inlined SSR fetches).
	let retail: RetailLocationHours[] = $state([]);

	let logStorage: IndexedDbLogStorage | undefined;
	// NOT todayIso() (ET-anchored, for the SSR menu-day) -- this reads IndexedDB log entries, which
	// are written with browser-local nowLocalIso() (issues #111/#124). Reader has to agree with that
	// writer's calendar day, not UMass Dining's, or a just-logged dinner can read back as "not today"
	// (issue #188 rework finding 1).
	const date = isoDateOf(nowLocalIso());
	let entries: LogEntry[] = $state([]);
	let totals: DailyMacroTotals = $state({ date, calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 });
	// Undefined until the first read completes — same reasoning as /today: without it, a fresh visit
	// with real logged food briefly flashes the "nothing logged" empty state.
	let loaded = $state(false);

	// #68 (onboarding/first-run): shown once, device-local (localStorage), zero server calls -- see
	// $lib/firstRun.ts. Starts hidden (SSR has no localStorage) and flips on in onMount only if the
	// user hasn't dismissed it before, same "hidden until checked" shape as `loaded` above.
	let showFirstRun = $state(false);

	// #67: "Your top dishes" module -- top 3 ranked dishes, device-local (IndexedDB), same
	// residency/no-auth rule as the macro stats above. rankedLoaded exists for the same reason
	// `loaded` does: without it, a fresh visit with real rankings briefly flashes the empty state.
	const rankingStorage = new IndexedDbRankingStorage();
	let rankedDishes: RankedDish[] = $state([]);
	let rankedLoaded = $state(false);
	const topDishes = $derived(rankDishes(rankedDishes).slice(0, 3));

	const today = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	onMount(() => {
		logStorage = new IndexedDbLogStorage();
		refreshFavorites();
		refreshLog();
		refreshRanking();
		refreshRetail();
		showFirstRun = !isFirstRunDismissed();
	});

	async function refreshRetail() {
		try {
			const res = await fetch("/api/hours");
			if (!res.ok) return;
			const feed = (await res.json()) as { retail: RetailLocationHours[] };
			retail = feed.retail;
		} catch {
			// Same "degrade, don't break the dashboard" posture as the rest of this page -- a failed
			// hours fetch just means the section below stays empty, never a page-level error.
		}
	}

	async function refreshRanking() {
		rankedDishes = await rankingStorage.getRankedDishes();
		rankedLoaded = true;
	}

	function closeFirstRun() {
		dismissFirstRun();
		showFirstRun = false;
	}

	async function refreshFavorites() {
		const favorites = await favoritesStorage.getFavorites();
		favoriteHallTids = new Set(favorites.filter((f) => f.type === "location").map((f) => f.hallTid));
	}

	async function refreshLog() {
		if (!logStorage) return;
		entries = await logStorage.getEntriesForDate(date);
		totals = computeDailyTotals(date, entries);
		loaded = true;
	}

	async function toggleFavoriteHall(hallTid: number) {
		const favorite: Favorite = { type: "location", hallTid };
		if (favoriteHallTids.has(hallTid)) {
			await favoritesStorage.removeFavorite(favorite);
		} else {
			await favoritesStorage.addFavorite(favorite);
		}
		await refreshFavorites();
	}
</script>

<header>
	<h1 class="page-title">Today</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">
		Your macros so far, and what&rsquo;s on at the four halls today &mdash; no account needed.
	</p>
	<p class="mt-1 font-mono text-xs tracking-widest text-ink-900/50 uppercase">{today}</p>
</header>

{#if showFirstRun}
	<section class="card mt-6 px-5 py-5" data-testid="first-run-card">
		<div class="flex items-start justify-between gap-4">
			<div>
				<p class="font-display text-lg uppercase text-maroon-900">Welcome to UDine</p>
				<p class="mt-2 max-w-prose text-sm text-ink-900/80">
					Menus, logging, macros and dish rankings all work with no account &mdash; what you eat
					never leaves this device. Export your full history any time from Today&rsquo;s macros.
				</p>
				<p class="mt-2 max-w-prose text-sm text-ink-900/80">
					Signing in only adds friends, pings, cross-device favorites and favorited-dish push
					alerts &mdash; nothing else.
				</p>
			</div>
			<button
				onclick={closeFirstRun}
				aria-label="Dismiss welcome message"
				class="btn btn-ghost btn-sm shrink-0"
			>
				Got it
			</button>
		</div>
	</section>
{/if}

<section class="mt-6">
	{#if loaded && entries.length === 0}
		<div class="empty-state">
			<p class="font-display text-lg uppercase">Nothing logged yet today.</p>
			<p class="mt-2 text-sm">Pick a hall below and log what you eat.</p>
		</div>
	{:else}
		<div class="card px-5 py-5">
			<MacroStats {totals} entryCount={entries.length} />
		</div>
		<p class="mt-3">
			<a href="/today" class="text-sm font-semibold text-maroon-600 no-underline hover:text-maroon-900">
				Full day &rarr;
			</a>
		</p>
	{/if}
</section>

<!-- #67: rank-informed home surface -- top 3 device-local ranked dishes, empty state when the user
     hasn't compared anything yet. Additive: sits between today's stats and the halls grid, doesn't
     restructure either. -->
<section class="mt-8">
	<h2 class="section-title">Your Top Dishes</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if topDishes.length > 0}
		<ol class="mt-3 flex flex-col gap-1.5">
			{#each topDishes as dish, i (dish.dishName + '::' + dish.hallTid)}
				<li class="card flex items-center gap-3 px-4 py-2.5">
					<span class="w-7 shrink-0 font-display text-lg text-ink-900/35 tabular-nums">{i + 1}</span>
					<span class="min-w-0 flex-1 font-semibold">{dish.dishName}</span>
					<span class="badge">{hallNameFor(dish.hallTid)}</span>
				</li>
			{/each}
		</ol>
		<p class="mt-3">
			<a href="/rank" class="text-sm font-semibold text-maroon-600 no-underline hover:text-maroon-900">
				Full ranking &rarr;
			</a>
		</p>
	{:else if rankedLoaded}
		<!-- Gated on rankedLoaded, not just "topDishes.length === 0" -- SSR (and the pre-onMount client
		     render) has no IndexedDB, so topDishes is always [] until the read resolves. Without this
		     gate this branch would render (and briefly flash) the empty state even when the device has
		     real ranking data -- see #63's own review note on the equivalent one-directional `loaded`
		     guard elsewhere on this page. -->
		<p class="mt-3 text-sm text-ink-900/60">
			No comparisons yet &mdash; rank the dishes you've logged and your favorites show up here.
		</p>
		<!-- "Start ranking", not "Compare dishes" -- the "More" section below already has a link named
		     "Compare dishes" (see home-dashboard.spec.ts), and a second link with the same accessible
		     name would make that spec's getByRole("link", { name: "Compare dishes" }) ambiguous. -->
		<p class="mt-3"><a href="/rank" class="btn btn-secondary no-underline">Start ranking</a></p>
	{/if}
</section>

<section class="mt-8">
	<h2 class="section-title">Dining Halls</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	<ul class="mt-3 grid gap-3 sm:grid-cols-2">
		{#each DINING_HALLS as hall (hall.tid)}
			{@const isFavorite = favoriteHallTids.has(hall.tid)}
			<li class="card flex items-center gap-3 px-4 py-4">
				<!-- The e2e specs detect favorite state from this button's text, so the glyph is the whole
				     content — no icon swap, no visually-hidden label inside it. aria-pressed is additive. -->
				<button
					onclick={() => toggleFavoriteHall(hall.tid)}
					aria-label="favorite"
					aria-pressed={isFavorite}
					title={isFavorite ? `Remove ${hall.name} from favorites` : `Add ${hall.name} to favorites`}
					class="shrink-0 rounded-sm px-1 text-2xl leading-none transition-colors {isFavorite
						? 'text-gold-500'
						: 'text-ink-900/30 hover:text-gold-500'}"
				>
					{isFavorite ? '★' : '☆'}
				</button>

				<div class="min-w-0 flex-1">
					<a
						href="/halls/{hall.slug}"
						class="font-display text-xl font-semibold tracking-wide text-maroon-900 uppercase no-underline hover:text-maroon-600"
					>
						{hall.name}
					</a>
					<p class="text-sm text-ink-900/60">
						{#if isFavorite}<span class="badge mr-1">Favorite</span>{/if}
						Today&rsquo;s menu &amp; nutrition
					</p>
				</div>

				<span aria-hidden="true" class="font-display text-xl text-maroon-600">&rarr;</span>
			</li>
		{/each}
	</ul>
</section>

{#if retail.length > 0}
	<!-- #178: café-tap parity -- makes the cafés/markets rows navigable (probe-at-tap per the
	     mobile-parity spec: /cafes/[tid] itself calls fetchMenu(locationId, today) to decide
	     menu-vs-fallback, not this listing). A location without a locationId (RetailLocationHours,
	     #176 -- degrades to undefined on a malformed get_infov2 entry) renders as plain text instead
	     of a dead link, same "degrade, don't throw or dead-end" posture as the rest of #176's plumbing.
	     Plain <div>s, not <ul>/<li> -- get_infov2 really does publish "Hampshire Café"/"Hampshire
	     Grab 'N Go" alongside the Dining Halls section's own "Hampshire" link, and every existing
	     hall e2e spec locates its hall via an unscoped getByRole("listitem").filter({hasText:
	     "Hampshire"}); a second, unrelated listitem containing that same substring made those specs'
	     locators ambiguous (verified red against real live data before this fix, reverted to confirm
	     green after). No accessibility loss -- this list doesn't need list/listitem semantics any
	     more than the "More" section's plain link row below it does. -->
	<section class="mt-8">
		<h2 class="section-title">Cafés &amp; Markets</h2>
		<div class="label-rule mt-1 text-ink-900/25"></div>

		<div class="mt-3 flex flex-col gap-2">
			{#each retail as loc (loc.name)}
				<div class="card flex items-center gap-3 px-4 py-3">
					{#if loc.locationId}
						<a
							href="/cafes/{loc.locationId}"
							class="min-w-0 flex-1 font-display text-base font-semibold tracking-wide text-maroon-900 uppercase no-underline hover:text-maroon-600"
						>
							{loc.name}
						</a>
						<span aria-hidden="true" class="font-display text-lg text-maroon-600">&rarr;</span>
					{:else}
						<span class="min-w-0 flex-1 font-display text-base font-semibold tracking-wide text-maroon-900 uppercase">
							{loc.name}
						</span>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

<section class="mt-8">
	<h2 class="section-title">More</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	<div class="mt-3 flex flex-wrap gap-3">
		<a href="/rank" class="btn btn-secondary no-underline">Compare dishes</a>
		<a href="/favorites" class="btn btn-secondary no-underline">Favorite dishes</a>
	</div>
</section>
