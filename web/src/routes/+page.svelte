<script lang="ts">
	import { onMount } from "svelte";
	import { DINING_HALLS, computeDailyTotals, type DailyMacroTotals, type Favorite, type LogEntry } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { todayIso } from "$lib/date";
	import MacroStats from "$lib/MacroStats.svelte";
	import { dismissFirstRun, isFirstRunDismissed } from "$lib/firstRun";

	// #64 (web IA: Today-first home): `/` is now a dashboard — today's macro stats (device-local,
	// no auth, no server call — see CLAUDE.md's data-residency table), then the four halls as compact
	// cards, then quick links to Rank/Favorites. `/today` remains the full detail view (log list,
	// split bar, exports); this page only reads today's slice of the same IndexedDB log, via the same
	// computeDailyTotals + MacroStats this repo already uses there, not a re-derivation of its own.
	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favoriteHallTids: Set<number> = $state(new Set());

	let logStorage: IndexedDbLogStorage | undefined;
	const date = todayIso();
	let entries: LogEntry[] = $state([]);
	let totals: DailyMacroTotals = $state({ date, calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0 });
	// Undefined until the first read completes — same reasoning as /today: without it, a fresh visit
	// with real logged food briefly flashes the "nothing logged" empty state.
	let loaded = $state(false);

	// #68 (onboarding/first-run): shown once, device-local (localStorage), zero server calls -- see
	// $lib/firstRun.ts. Starts hidden (SSR has no localStorage) and flips on in onMount only if the
	// user hasn't dismissed it before, same "hidden until checked" shape as `loaded` above.
	let showFirstRun = $state(false);

	const today = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	onMount(() => {
		logStorage = new IndexedDbLogStorage();
		refreshFavorites();
		refreshLog();
		showFirstRun = !isFirstRunDismissed();
	});

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

<section class="mt-8">
	<h2 class="section-title">More</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>
	<div class="mt-3 flex flex-wrap gap-3">
		<a href="/rank" class="btn btn-secondary no-underline">Compare dishes</a>
		<a href="/favorites" class="btn btn-secondary no-underline">Favorite dishes</a>
	</div>
</section>
