<script lang="ts">
	import { onMount } from "svelte";
	import { DINING_HALLS, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";

	const favoritesStorage = new IndexedDbFavoritesStorage();
	let favoriteHallTids: Set<number> = $state(new Set());

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

<h1>UDine</h1>
<p>
	<a href="/today">Today's macros</a> | <a href="/filters">Filters</a> | <a href="/favorites">Favorites</a> |
	<a href="/press">Press</a> | <a href="/events">Events</a> | <a href="/faq">FAQ</a>
</p>

<h2>Dining Halls</h2>
<ul>
	{#each DINING_HALLS as hall (hall.tid)}
		<li>
			<button onclick={() => toggleFavoriteHall(hall.tid)} aria-label="favorite">
				{favoriteHallTids.has(hall.tid) ? '★' : '☆'}
			</button>
			<a href="/halls/{hall.slug}">{hall.name}</a>
		</li>
	{/each}
</ul>
