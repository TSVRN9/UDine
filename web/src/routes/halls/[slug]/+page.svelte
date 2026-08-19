<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { menuItemMatchesPreferences, type Favorite, type FoodPreferences, type LogEntry, type MealPeriod, type MenuItem } from "@udine/shared";
	import { favoriteKey } from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { loadPreferences } from "$lib/preferences";
	import { addDaysIso, todayIso } from "$lib/date";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const favoritesStorage = new IndexedDbFavoritesStorage();
	const mealPeriods: MealPeriod[] = ["breakfast", "lunch", "dinner"];

	let servings: Record<string, number> = $state({});
	let loggedMessage = $state("");
	let prefs: FoodPreferences = $state({ allergensToAvoid: [], requiredDietTags: [] });
	let favoriteDishKeys: Set<string> = $state(new Set());

	const dateLabel = $derived(
		new Date(`${data.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
	);
	// Recomputed client-side (not just trusted from the loader) so a future-dated deep link
	// still gets an accurate prev/empty-state decision after hydration.
	const isToday = $derived(data.date === todayIso());
	// The filter-banner and "everything filtered out" copy below reads as wrong when browsing a
	// future day and it still says "today's menu" -- neutral wording covers both cases.
	const menuPossessive = $derived(isToday ? "today’s" : "this day’s");

	function goToDate(dateIso: string) {
		// keepFocus: these are keyboard-operable date-nav buttons; without it SvelteKit's default
		// nav behavior moves focus to <body> on every click, dropping a keyboard user back to the
		// top of the page instead of leaving them on the button they just pressed.
		goto(`?date=${dateIso}`, { keepFocus: true });
	}

	// How many of today's dishes the user's own filters are removing. Without this the page just
	// quietly shows fewer dishes (or an empty meal period) and looks like UMass posted nothing —
	// the single most confusing thing the filter feature can do.
	const hiddenCount = $derived(data.items.filter((i) => !menuItemMatchesPreferences(i, prefs)).length);

	// A same-route ?date= nav swaps `data.items` without remounting the component, so seeding must
	// react to `data.items` itself rather than run once in onMount -- otherwise a new day's dishes
	// never get their default `servings` entry and render blank (#76 review finding). Existence
	// check (`in`), not `??=`: clearing the input leaves `null` behind (see logItem's own comment
	// on this), and `??=` would read that as unset and stomp it back to 1 out from under a user
	// who's actively clearing the field -- `in` only seeds a key that has never been set at all.
	$effect(() => {
		for (const item of data.items) if (!(item.dishName in servings)) servings[item.dishName] = 1;
	});

	onMount(async () => {
		prefs = loadPreferences();
		const favorites = await favoritesStorage.getFavorites();
		favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
	});

	function itemsFor(period: MealPeriod): MenuItem[] {
		return data.items.filter((i) => i.mealPeriod === period && menuItemMatchesPreferences(i, prefs));
	}

	// Preserves the order categories arrive in from the feed — that's the order the dining hall
	// itself lists them, which is more useful than alphabetical.
	function categoriesIn(items: MenuItem[]): string[] {
		return [...new Set(items.map((i) => i.category))];
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
		// Clearing the number input leaves null behind (Svelte's number binding maps "" to null,
		// never NaN); fall back to a single serving for that and any other non-numeric state.
		const qty = Number(servings[item.dishName]) || 1;
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

<header>
	<p class="font-mono text-xs tracking-widest text-ink-900/50 uppercase">
		<!-- "All halls", not "Dining Halls": the nav link already carries that exact name, and the
		     e2e specs click `getByRole("link", { name: "Dining Halls" })` while on this page — two
		     matches would be a strict-mode violation. -->
		<a href="/" class="no-underline hover:underline">All halls</a> / {dateLabel}
	</p>
	<h1 class="page-title mt-1">{data.hall.name}</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
</header>

<!-- #72: no past nav (API has no history -- prev is disabled once we're already on today) and no
     forward cap (UMass's publish window rolls and isn't hardcoded here -- see
     docs/apk-reverse-engineering.md's "Future dates" bullet; an out-of-window day just renders
     the empty state below instead of disabling Next). -->
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
			<!-- #72: a future day outside UMass's rolling publish window (or simply not posted yet)
			     also comes back as `[]` -- distinct copy from the today case above, since "hasn't
			     published yet" reads as broken for a day that was never going to have a menu today. -->
			<p class="font-display text-lg uppercase">Not posted yet</p>
			<p class="mt-2 text-sm">Menu not posted yet &mdash; UMass publishes about two weeks ahead.</p>
			<p class="mt-4">
				<button class="btn btn-secondary" onclick={() => goToDate(todayIso())}>Back to today</button>
			</p>
		{/if}
	</div>
{:else if hiddenCount === data.items.length}
	<!-- A menu exists but the user's own filters removed all of it. Without this branch the page
	     renders a title and nothing else, which is indistinguishable from UMass posting no menu. -->
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">Everything is filtered out</p>
		<p class="mt-2 text-sm">
			All {data.items.length} dishes on {menuPossessive} menu conflict with your dietary filters.
		</p>
		<p class="mt-4"><a href="/filters" class="btn btn-secondary no-underline">Edit dietary preferences</a></p>
	</div>
{/if}

{#each mealPeriods as period (period)}
	{@const items = itemsFor(period)}
	{#if items.length > 0}
		<section class="mt-8">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="section-title">{period}</h2>
				<span class="font-mono text-xs text-ink-900/50">
					{items.length}
					{items.length === 1 ? "dish" : "dishes"}
				</span>
			</div>
			<div class="label-rule mt-1 text-ink-900/25"></div>

			{#each categoriesIn(items) as category (category)}
				<h3 class="mt-5 font-body text-xs font-semibold tracking-[0.15em] text-ink-900/55 uppercase">
					{category}
				</h3>
				<ul class="mt-2 flex flex-col gap-2">
					{#each items.filter((i) => i.category === category) as item (item.dishName + item.category)}
						{@const isFavorite = favoriteDishKeys.has(favoriteKey({ type: 'dish', dishName: item.dishName }))}
						<li class="card flex flex-wrap items-start gap-x-3 gap-y-3 px-4 py-3">
							<!-- Glyph-only by contract: the favorites e2e spec reads this button's text to
							     detect state, so no icon swap and no hidden label inside it. -->
							<button
								onclick={() => toggleFavoriteDish(item.dishName)}
								aria-label="favorite"
								aria-pressed={isFavorite}
								title={isFavorite ? `Remove ${item.dishName} from favorites` : `Add ${item.dishName} to favorites`}
								class="shrink-0 rounded-sm px-1 text-xl leading-none transition-colors {isFavorite
									? 'text-gold-500'
									: 'text-ink-900/25 hover:text-gold-500'}"
							>
								{isFavorite ? '★' : '☆'}
							</button>

							<div class="min-w-0 flex-1 basis-64">
								<p class="font-display text-lg leading-tight font-semibold text-maroon-900">{item.dishName}</p>
								<p class="mt-0.5 font-mono text-sm text-ink-900/75">
									{item.nutrition.calories} cal
									<span class="text-ink-900/35">·</span>
									{item.nutrition.proteinG}g protein
									<span class="text-ink-900/35">·</span>
									{item.nutrition.totalCarbG}g carbs
									<span class="text-ink-900/35">·</span>
									{item.nutrition.totalFatG}g fat
								</p>
								<p class="mt-0.5 text-xs text-ink-900/50">per {item.nutrition.servingSize}</p>
								{#if item.dietTags.length > 0}
									<p class="mt-1.5 flex flex-wrap gap-1">
										{#each item.dietTags as tag (tag)}
											<span class="badge bg-maroon-600/10 text-maroon-600">{tag}</span>
										{/each}
									</p>
								{/if}
								{#if item.allergens.length > 0}
									<p class="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-900/50">
										Contains
										{#each item.allergens as allergen (allergen)}
											<span class="badge">{allergen}</span>
										{/each}
									</p>
								{/if}
							</div>

							<div class="flex shrink-0 items-end gap-2">
								<label class="block">
									<span class="field-label mb-1">Servings</span>
									<input
										type="number"
										min="0.25"
										step="0.25"
										bind:value={servings[item.dishName]}
										class="input w-20 text-right font-mono"
									/>
								</label>
								<button onclick={() => logItem(item)} class="btn btn-primary">Log</button>
							</div>
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{/if}
{/each}

<!-- Fixed rather than inline at the top of the page: a menu runs to a few hundred dishes, so
     confirmation rendered above the fold is invisible at the moment you actually press Log. Single
     role="status" region on this page by design — the e2e specs assert on exactly one. -->
{#if loggedMessage}
	<p
		role="status"
		class="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-md bg-maroon-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-lg"
	>
		{loggedMessage}
	</p>
{/if}
