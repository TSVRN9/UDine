<script lang="ts">
	import { onMount } from "svelte";
	import { DINING_HALLS, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";

	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favorites: Favorite[] = $state([]);

	onMount(refresh);

	async function refresh() {
		favorites = await favoritesStorage.getFavorites();
	}

	async function remove(favorite: Favorite) {
		await favoritesStorage.removeFavorite(favorite);
		await refresh();
	}

	function hallName(tid: number): string {
		return DINING_HALLS.find((h) => h.tid === tid)?.name ?? `Hall ${tid}`;
	}

	function isDish(f: Favorite): f is Extract<Favorite, { type: "dish" }> {
		return f.type === "dish";
	}

	function isLocation(f: Favorite): f is Extract<Favorite, { type: "location" }> {
		return f.type === "location";
	}
</script>

<h1>Favorites</h1>

<h2>Dishes</h2>
{#if favorites.filter(isDish).length === 0}
	<p>No favorite dishes yet.</p>
{/if}
<ul>
	{#each favorites.filter(isDish) as favorite (favorite.dishName)}
		<li>{favorite.dishName} <button onclick={() => remove(favorite)}>Remove</button></li>
	{/each}
</ul>

<h2>Dining Halls</h2>
{#if favorites.filter(isLocation).length === 0}
	<p>No favorite dining halls yet.</p>
{/if}
<ul>
	{#each favorites.filter(isLocation) as favorite (favorite.hallTid)}
		<li>{hallName(favorite.hallTid)} <button onclick={() => remove(favorite)}>Remove</button></li>
	{/each}
</ul>
