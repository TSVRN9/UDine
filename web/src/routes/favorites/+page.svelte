<script lang="ts">
	import { onMount } from "svelte";
	import { hallNameFor, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";

	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favorites: Favorite[] = $state([]);
	// #322: set when the IndexedDB read/write here fails (issue #193's bug class). Without this,
	// refresh()/remove() rejections were unhandled and this page just silently no-op'd.
	let dbError = $state(false);

	onMount(refresh);

	async function refresh() {
		try {
			favorites = await favoritesStorage.getFavorites();
			dbError = false;
		} catch {
			dbError = true;
		}
	}

	// Whole body in one try/catch, not just the write -- see /'s toggleFavoriteHall for why
	// catching only the write and still unconditionally calling refresh() would let a succeeding
	// read reset dbError back to false right after this catch set it.
	async function remove(favorite: Favorite) {
		try {
			await favoritesStorage.removeFavorite(favorite);
			await refresh();
		} catch {
			dbError = true;
		}
	}

	function isDish(f: Favorite): f is Extract<Favorite, { type: "dish" }> {
		return f.type === "dish";
	}

	function isLocation(f: Favorite): f is Extract<Favorite, { type: "location" }> {
		return f.type === "location";
	}
</script>

<header>
	<h1 class="page-title">Favorites</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
</header>

{#if dbError}
	<p role="alert" class="badge mt-4">
		Couldn't load your favorites — try closing other UDine tabs and reloading this page.
	</p>
{/if}

<section class="mt-8">
	<h2 class="section-title">Dishes</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if favorites.filter(isDish).length === 0}
		<div class="empty-state mt-4">
			<p>No favorite dishes yet.</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-col gap-2">
			{#each favorites.filter(isDish) as favorite (favorite.dishName)}
				<li class="card flex items-center justify-between gap-3 px-4 py-3">
					<span class="font-display text-lg font-semibold text-maroon-900">{favorite.dishName}</span>
					<button onclick={() => remove(favorite)} class="btn btn-ghost btn-sm">Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-8">
	<h2 class="section-title">Dining Halls</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if favorites.filter(isLocation).length === 0}
		<div class="empty-state mt-4">
			<p>No favorite dining halls yet.</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-col gap-2">
			{#each favorites.filter(isLocation) as favorite (favorite.hallTid)}
				<li class="card flex items-center justify-between gap-3 px-4 py-3">
					<span class="font-display text-lg font-semibold text-maroon-900">{hallNameFor(favorite.hallTid)}</span>
					<button onclick={() => remove(favorite)} class="btn btn-ghost btn-sm">Remove</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
