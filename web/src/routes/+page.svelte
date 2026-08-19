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

<h1 class="mb-4 text-2xl">Dining Halls</h1>
<ul class="flex flex-col gap-2">
	{#each DINING_HALLS as hall (hall.tid)}
		<li class="flex items-center gap-2 rounded-md bg-paper-50 px-4 py-3">
			<button onclick={() => toggleFavoriteHall(hall.tid)} aria-label="favorite" class="text-gold-500">
				{favoriteHallTids.has(hall.tid) ? '★' : '☆'}
			</button>
			<a href="/halls/{hall.slug}" class="font-display font-medium no-underline hover:text-maroon-600">{hall.name}</a>
		</li>
	{/each}
</ul>
