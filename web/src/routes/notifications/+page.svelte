<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import type { SupabaseClient } from "@supabase/supabase-js";
	import { DINING_HALLS, syncFavoritedFoods, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { PUBLIC_VAPID_KEY } from "$env/static/public";

	type Sighting = { id: string; dish_name: string; hall_tid: number; sighted_date: string; read_at: string | null; created_at: string };

	// Standard urlBase64-to-Uint8Array conversion PushManager.subscribe needs for applicationServerKey.
	function urlBase64ToUint8Array(base64: string): Uint8Array {
		const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
		const raw = atob(padded);
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	}

	function pushSupported(): boolean {
		return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(PUBLIC_VAPID_KEY);
	}

	async function clearStoredPushTokens(supabase: SupabaseClient, userId: string) {
		// ponytail: removes every stored web token for this user, not just this browser's — fine for
		// a single-device MVP. Per-device revocation would key the delete off the known token instead.
		await supabase.from("push_tokens").delete().eq("user_id", userId).eq("platform", "web");
	}

	async function enablePush(supabase: SupabaseClient, userId: string) {
		if (!pushSupported()) return;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== "granted") return;

			const registration = await navigator.serviceWorker.register("/service-worker.js");
			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY) as BufferSource,
			});
			await supabase
				.from("push_tokens")
				.upsert({ user_id: userId, platform: "web", token: JSON.stringify(subscription.toJSON()) });
		} catch (err) {
			// Permission denied, malformed VAPID key, no service-worker support in this browser, etc. —
			// notifications_enabled can still toggle for the in-app feed even if push registration fails.
			console.error("Push subscription failed:", err);
		}
	}

	async function disablePush(supabase: SupabaseClient, userId: string) {
		if (pushSupported()) {
			try {
				const registration = await navigator.serviceWorker.getRegistration();
				const subscription = await registration?.pushManager.getSubscription();
				await subscription?.unsubscribe();
			} catch (err) {
				console.error("Push unsubscribe failed:", err);
			}
		}
		await clearStoredPushTokens(supabase, userId);
	}

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

		// Browser permission can be revoked outside this page (browser settings) without us hearing
		// about it — if that happened, the stored push_tokens row is now dead, so clear it. The
		// in-app notifications_enabled flag (and food_sightings feed) is untouched either way.
		if (notificationsEnabled && pushSupported() && Notification.permission !== "granted") {
			await clearStoredPushTokens(supabase, session.user.id);
		}

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

		if (next) {
			await enablePush(supabase, session.user.id);
		} else {
			await disablePush(supabase, session.user.id);
		}
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
	<p><small>Turning this on will ask your browser for notification permission and register a push subscription. Server-side push dispatch is still a work in progress — see CLAUDE.md — but this page is always the notification feed.</small></p>

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
