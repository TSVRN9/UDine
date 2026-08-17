<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
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

	async function signInWithGoogle() {
		if (!page.data.supabase) return;
		await page.data.supabase.auth.signInWithOAuth({
			provider: "google",
			options: { redirectTo: `${location.origin}/auth/callback` },
		});
	}

	async function signOut() {
		if (!page.data.supabase) return;
		await page.data.supabase.auth.signOut();
		location.reload();
	}
</script>

<h1>UDine</h1>
<p>
	{#if page.data.session}
		Signed in as {page.data.session.user.email} <button onclick={signOut}>Sign out</button>
	{:else}
		<button onclick={signInWithGoogle}>Sign in with Google</button>
	{/if}
</p>
<p>
	<a href="/today">Today's macros</a> | <a href="/filters">Filters</a> | <a href="/favorites">Favorites</a> |
	<a href="/rank">Rank dishes</a> |
	<a href="/friends">Friends</a> | <a href="/notifications">Notifications</a> |
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
