<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { DINING_HALLS, syncFavoritedFoods, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";

	type Sighting = { id: string; dish_name: string; hall_tid: number; sighted_date: string; read_at: string | null; created_at: string };

	const favoritesStorage = new IndexedDbFavoritesStorage();

	let notificationsEnabled = $state(false);
	let sightings: Sighting[] = $state([]);

	function hallName(hallTid: number): string {
		return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
	}

	async function refresh() {
		const supabase = page.data.supabase;
		const session = page.data.session;
		if (!supabase || !session) return;

		const { data: profile } = await supabase.from("profiles").select("notifications_enabled").eq("user_id", session.user.id).single();
		notificationsEnabled = profile?.notifications_enabled ?? false;

		const { data } = await supabase.from("food_sightings").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false });
		sightings = data ?? [];
	}

	onMount(refresh);

	async function toggleNotifications() {
		const supabase = page.data.supabase;
		const session = page.data.session;
		if (!supabase || !session) return;

		const next = !notificationsEnabled;
		await supabase.from("profiles").update({ notifications_enabled: next }).eq("user_id", session.user.id);
		notificationsEnabled = next;

		// Sync (or clear) favorited_foods to match the new state — see CLAUDE.md: favorited_foods only
		// syncs when signed in AND notifications_enabled.
		const favorites: Favorite[] = next ? await favoritesStorage.getFavorites() : [];
		await syncFavoritedFoods(supabase, session.user.id, favorites);
	}

	async function markRead(sighting: Sighting) {
		const supabase = page.data.supabase;
		if (!supabase || sighting.read_at) return;
		const readAt = new Date().toISOString();
		await supabase.from("food_sightings").update({ read_at: readAt }).eq("id", sighting.id);
		sighting.read_at = readAt;
	}
</script>

<a href="/">&larr; Dining Halls</a>
<h1>Notifications</h1>

{#if !page.data.session}
	<p>Sign in to enable favorited-food alerts.</p>
{:else}
	<p>
		<label>
			<input type="checkbox" checked={notificationsEnabled} onchange={toggleNotifications} />
			Notify me when a favorited dish shows up on the menu
		</label>
	</p>
	<p><small>Push delivery isn't wired up yet — this page is the notification feed for now. See CLAUDE.md.</small></p>

	<h2>Sightings</h2>
	{#if sightings.length === 0}
		<p>No favorited-food sightings yet.</p>
	{:else}
		<ul>
			{#each sightings as s (s.id)}
				<li onmouseenter={() => markRead(s)} style={s.read_at ? "opacity: 0.6" : ""}>
					<strong>{s.dish_name}</strong> at {hallName(s.hall_tid)} on {s.sighted_date}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
