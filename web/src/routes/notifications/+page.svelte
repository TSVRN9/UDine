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

<h1 class="page-title">Notifications</h1>
<div class="label-rule mt-2 mb-6 text-gold-500"></div>

{#if !page.data.session}
	<div class="empty-state">
		<p>Sign in to enable favorited-food alerts.</p>
	</div>
{:else}
	<!-- .badge carries the on/off state in words, not just the checkbox, per #39's "notification
	     toggle visually clear" criterion. -->
	<section class="card mb-2 flex flex-wrap items-center justify-between gap-3 p-4">
		<div>
			<label class="field-label" for="notif-toggle">Favorited-dish alerts</label>
			<p class="mt-1 text-sm text-ink-900/70">Notify me when a favorited dish shows up on the menu.</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="badge">{notificationsEnabled ? "Alerts on" : "Alerts off"}</span>
			<input id="notif-toggle" type="checkbox" class="h-4 w-4" checked={notificationsEnabled} onchange={toggleNotifications} />
		</div>
	</section>
	<p class="mb-6 text-sm text-ink-900/60">
		Turning this on will ask your browser for notification permission and register a push subscription. This page is always the notification feed either way.
	</p>

	<h2 class="section-title mb-3">Sightings</h2>
	{#if sightings.length === 0}
		<div class="empty-state">No favorited-food sightings yet.</div>
	{:else}
		<ul class="space-y-2">
			{#each sightings as s (s.id)}
				<!-- opacity-60 (a Tailwind utility, not a new color) replaces the old inline style for
				     read rows; .badge marks unread ones "New" instead. onmouseenter-only markRead is
				     pre-existing behavior, unchanged here -- keyboard users can't trigger it, but fixing
				     that isn't in #39's scope. -->
				<li class="card flex flex-wrap items-center gap-2 p-3 {s.read_at ? 'opacity-60' : ''}" onmouseenter={() => markRead(s)}>
					{#if !s.read_at}<span class="badge">New</span>{/if}
					<strong>{s.dish_name}</strong>
					<span class="badge">{hallName(s.hall_tid)}</span>
					<span class="text-sm text-ink-900/60">on {s.sighted_date}</span>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
