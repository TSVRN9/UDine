<script lang="ts">
	import { onMount } from "svelte";
	import { DINING_HALLS, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { todayIso } from "$lib/date";

	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favoriteHallTids: Set<number> = $state(new Set());

	const today = new Date(`${todayIso()}T00:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});

	onMount(refresh);

	async function refresh() {
		const favorites = await favoritesStorage.getFavorites();
		favoriteHallTids = new Set(favorites.filter((f) => f.type === "location").map((f) => f.hallTid));
	}

	async function toggleFavoriteHall(hallTid: number) {
		const favorite: Favorite = { type: "location", hallTid };
		if (favoriteHallTids.has(hallTid)) {
			await favoritesStorage.removeFavorite(favorite);
		} else {
			await favoritesStorage.addFavorite(favorite);
		}
		await refresh();
	}
</script>

<header>
	<h1 class="page-title">Dining Halls</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">
		Today&rsquo;s menus and full nutrition for all four halls, straight from UMass Dining. Open one to
		browse and log what you eat &mdash; no account needed.
	</p>
	<p class="mt-1 font-mono text-xs tracking-widest text-ink-900/50 uppercase">{today}</p>
</header>

<ul class="mt-6 grid gap-3 sm:grid-cols-2">
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
