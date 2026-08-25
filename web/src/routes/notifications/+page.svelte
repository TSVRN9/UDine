<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import type { SupabaseClient } from "@supabase/supabase-js";
	import { DINING_HALLS, hallNameFor, syncFavoritedFoods, type Favorite } from "@udine/shared";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import { loadFeedLastSeen, saveFeedLastSeen } from "$lib/feedLastSeen";
	import { ownPushToken, clearStoredPushTokens } from "$lib/pushTokens";
	import { PUBLIC_VAPID_KEY } from "$env/static/public";

	type Sighting = { id: string; dish_name: string; hall_tid: number; sighted_date: string; read_at: string | null; created_at: string };
	type Ping = { id: string; sender_id: string; hall_tid: number | null; message: string | null; created_at: string };
	type Profile = { user_id: string; display_name: string };

	type FeedItem =
		| { kind: "sighting"; id: string; createdAt: string; dishName: string; hallTid: number; sightedDate: string; readAt: string | null }
		| { kind: "ping"; id: string; createdAt: string; senderName: string; hallTid: number | null; message: string | null };

	// Standard urlBase64-to-Uint8Array conversion PushManager.subscribe needs for applicationServerKey.
	function urlBase64ToUint8Array(base64: string): Uint8Array {
		const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
		const raw = atob(padded);
		return Uint8Array.from(raw, (c) => c.charCodeAt(0));
	}

	function pushSupported(): boolean {
		return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(PUBLIC_VAPID_KEY);
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
	let pings: Ping[] = $state([]);
	// Accepted friends only — enough to populate the "ping a friend" composer and to resolve a
	// ping's sender name. Friend search/request/accept itself stays on /friends (see #66).
	let friends: Profile[] = $state([]);
	// Snapshot of "last time this feed was viewed", read once at mount before it's overwritten below
	// -- deliberately a plain variable, not $state, so a ping's unread badge doesn't flip off mid-visit.
	let feedLastSeenAt = "";

	let selectedFriendId = $state("");
	let pingHallTid = $state("");
	let pingMessage = $state("");
	let pingSent = $state(false);
	let pingError = $state(false);

	let friendNameById = $derived(new Map(friends.map((f) => [f.user_id, f.display_name])));

	let feedItems: FeedItem[] = $derived(
		[
			...sightings.map(
				(s): FeedItem => ({ kind: "sighting", id: s.id, createdAt: s.created_at, dishName: s.dish_name, hallTid: s.hall_tid, sightedDate: s.sighted_date, readAt: s.read_at }),
			),
			...pings.map(
				(p): FeedItem => ({ kind: "ping", id: p.id, createdAt: p.created_at, senderName: friendNameById.get(p.sender_id) ?? "A friend", hallTid: p.hall_tid, message: p.message }),
			),
			// b.localeCompare(a) for descending (newest-first) order. The previous `a < b ? 1 : -1`
			// returned -1 for BOTH orderings of two equal-timestamp items (cmp(a,b) and cmp(b,a) both
			// said "I go first"), an invalid comparator that Array.sort doesn't guarantee stable/correct
			// results for.
		].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
	);

	function isUnread(item: FeedItem): boolean {
		if (item.kind === "sighting") return item.readAt === null;
		return item.createdAt > feedLastSeenAt;
	}

	async function refresh() {
		const supabase = page.data.supabase;
		const session = page.data.session;
		if (!supabase || !session) return;
		const myId = session.user.id;

		const { data: profile } = await supabase.from("profiles").select("notifications_enabled").eq("user_id", myId).single();
		notificationsEnabled = profile?.notifications_enabled ?? false;

		// Browser permission can be revoked outside this page (browser settings) without us hearing
		// about it — if that happened, the stored push_tokens row is now dead, so clear it. The
		// in-app notifications_enabled flag (and food_sightings feed) is untouched either way.
		//
		// #185: this used to fire on any non-"granted" permission, including "default" -- the state of
		// a browser that simply never asked (e.g. visiting this page from a second device/browser).
		// That wiped out every OTHER browser's live token too, since clearStoredPushTokens() had no way
		// to scope the delete. Only "denied" means *this* browser's subscription is actually dead; only
		// clear when we can also identify which row is this browser's own.
		if (notificationsEnabled && pushSupported() && Notification.permission === "denied") {
			const ownToken = await ownPushToken();
			if (ownToken) await clearStoredPushTokens(supabase, myId, ownToken);
		}

		const { data: sightingRows } = await supabase.from("food_sightings").select("*").eq("user_id", myId).order("created_at", { ascending: false });
		sightings = sightingRows ?? [];

		// Friends resolved *before* pings assigns below -- friendNameById needs to already be
		// populated when a ping first renders, or a sender briefly shows as the "A friend" fallback
		// until this catches up.
		const { data: fs } = await supabase.from("friendships").select("*").or(`user_a.eq.${myId},user_b.eq.${myId}`).eq("status", "accepted");
		const otherIds = (fs ?? []).map((f: { user_a: string; user_b: string }) => (f.user_a === myId ? f.user_b : f.user_a));
		if (otherIds.length > 0) {
			const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", otherIds);
			friends = profs ?? [];
		} else {
			friends = [];
		}

		const { data: pingRows } = await supabase.from("pings").select("*").eq("receiver_id", myId).order("created_at", { ascending: false });
		pings = pingRows ?? [];
	}

	onMount(() => {
		const myId = page.data.session?.user.id;
		feedLastSeenAt = myId ? loadFeedLastSeen(myId) : "";
		refresh().then(() => {
			// Only stamp when a session actually exists -- refresh() early-returns with no session
			// (nothing rendered), and previously this ran unconditionally, silently marking every
			// older ping as seen on a zero-item anonymous visit. Stamp from the newest rendered item's
			// own created_at (Postgres clock), not the browser's clock -- avoids drift between the two
			// making a just-created ping look already-seen.
			const newestCreatedAt = feedItems[0]?.createdAt;
			if (myId && newestCreatedAt) saveFeedLastSeen(myId, newestCreatedAt);
		});

		const supabase = page.data.supabase;
		if (!supabase || !myId) return;

		// Moved here from /friends (#66) — the pings inbox now lives in this feed, not buried in the
		// friends page's accepted-friends list.
		const channel = supabase
			.channel("pings-inbox")
			.on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter: `receiver_id=eq.${myId}` }, refresh)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	});

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

	async function markRead(sightingId: string) {
		const supabase = page.data.supabase;
		const sighting = sightings.find((s) => s.id === sightingId);
		if (!supabase || !sighting || sighting.read_at) return;
		const readAt = new Date().toISOString();
		await supabase.from("food_sightings").update({ read_at: readAt }).eq("id", sightingId);
		sighting.read_at = readAt;
	}

	async function sendPing() {
		const supabase = page.data.supabase;
		const myId = page.data.session?.user.id;
		if (!supabase || !myId || !selectedFriendId) return;
		const { error } = await supabase.from("pings").insert({
			sender_id: myId,
			receiver_id: selectedFriendId,
			hall_tid: pingHallTid ? Number(pingHallTid) : null,
			message: pingMessage || null,
		});
		if (error) {
			// e.g. RLS rejects the insert (not actually friends, receiver blocked). Previously this was
			// never checked -- "Ping sent" showed unconditionally even when nothing was sent.
			pingSent = false; // in case a still-live success badge from an earlier attempt is showing
			pingError = true;
			setTimeout(() => (pingError = false), 3000);
			return;
		}
		pingMessage = "";
		pingError = false; // in case a still-live failure badge from an earlier attempt is showing
		pingSent = true;
		setTimeout(() => (pingSent = false), 1500);
	}
</script>

<h1 class="page-title">Notifications</h1>
<div class="label-rule mt-2 mb-6 text-gold-500"></div>

{#if !page.data.session}
	<div class="empty-state">
		<p>Sign in to see this feed — pings from friends and favorited-dish alerts, all in one place.</p>
		<p class="mt-2 text-sm text-ink-900/70">Use "Sign in with Google" above to get started.</p>
	</div>
{:else}
	<!-- .badge carries the on/off state in words, not just the checkbox, per #39's "notification
	     toggle visually clear" criterion. -->
	<section class="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
		<div>
			<label class="field-label" for="notif-toggle">Favorited-dish alerts</label>
			<p class="mt-1 text-sm text-ink-900/70">Notify me when a favorited dish shows up on the menu.</p>
		</div>
		<div class="flex items-center gap-2">
			<span class="badge">{notificationsEnabled ? "Alerts on" : "Alerts off"}</span>
			<input id="notif-toggle" type="checkbox" class="h-4 w-4" checked={notificationsEnabled} onchange={toggleNotifications} />
		</div>
	</section>

	<!-- "Ping a friend" as a first-class action of the feed itself (#66), not buried in the friends
	     page's accepted-friends list. -->
	<section class="card mb-6 p-4">
		<h2 class="section-title mb-3">Ping a friend</h2>
		{#if friends.length === 0}
			<p class="text-sm text-ink-900/60">Add friends on the <a href="/friends">Friends page</a> to send pings.</p>
		{:else}
			<div class="flex flex-wrap items-end gap-2">
				<div>
					<label class="field-label" for="ping-friend">Friend</label>
					<select id="ping-friend" class="input" bind:value={selectedFriendId}>
						<option value="">Choose a friend</option>
						{#each friends as f (f.user_id)}
							<option value={f.user_id}>{f.display_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="field-label" for="ping-hall">Hall</label>
					<select id="ping-hall" class="input" bind:value={pingHallTid}>
						<option value="">(no hall)</option>
						{#each DINING_HALLS as hall (hall.tid)}
							<option value={hall.tid}>{hall.name}</option>
						{/each}
					</select>
				</div>
				<div class="flex-1">
					<label class="field-label" for="ping-message">Message (optional)</label>
					<input id="ping-message" class="input w-full" bind:value={pingMessage} placeholder="message (optional)" />
				</div>
				<button class="btn btn-primary btn-sm" onclick={sendPing} disabled={!selectedFriendId}>Send ping</button>
			</div>
			{#if pingSent}<p role="status" class="badge mt-2">Ping sent</p>{/if}
			{#if pingError}<p role="alert" class="badge mt-2">Couldn't send ping — try again.</p>{/if}
		{/if}
	</section>

	<h2 class="section-title mb-3">Activity</h2>
	{#if feedItems.length === 0}
		<div class="empty-state">Nothing here yet — pings from friends and favorited-dish sightings will show up here.</div>
	{:else}
		<ul class="space-y-2" aria-label="Activity feed">
			{#each feedItems as item (item.kind + item.id)}
				{@const unread = isUnread(item)}
				<!-- opacity-60 (a Tailwind utility, not a new color) marks read rows; .badge marks
				     unread ones "New". Sightings get an explicit "Mark as read" button (keyboard
				     reachable, closes #62) alongside the pre-existing onmouseenter, which stays for
				     mouse users. -->
				<li class="card flex flex-wrap items-center gap-2 p-3 {unread ? '' : 'opacity-60'}" onmouseenter={item.kind === "sighting" ? () => markRead(item.id) : undefined}>
					{#if unread}<span class="badge">New</span>{/if}
					{#if item.kind === "sighting"}
						<strong>{item.dishName}</strong>
						<span class="badge">{hallNameFor(item.hallTid)}</span>
						<span class="text-sm text-ink-900/60">spotted on {item.sightedDate}</span>
						{#if unread}
							<button class="btn btn-secondary btn-sm" onclick={() => markRead(item.id)}>Mark as read</button>
						{/if}
					{:else}
						<span class="badge">Ping</span>
						<strong>{item.senderName}</strong> wants to eat
						{#if item.hallTid}<span class="badge">{hallNameFor(item.hallTid)}</span>{/if}
						{#if item.message}<span class="block text-ink-900/70">&mdash; "{item.message}"</span>{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
