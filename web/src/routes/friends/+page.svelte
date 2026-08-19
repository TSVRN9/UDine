<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { DINING_HALLS } from "@udine/shared";

	type Profile = { user_id: string; display_name: string };
	type Friendship = { user_a: string; user_b: string; status: "pending" | "accepted"; requested_by: string };
	type Ping = { id: string; sender_id: string; receiver_id: string; hall_tid: number | null; message: string | null; created_at: string };

	let query = $state("");
	let searchResults: Profile[] = $state([]);
	let friendships: Friendship[] = $state([]);
	let profilesById: Map<string, Profile> = $state(new Map());
	let inbox: Ping[] = $state([]);
	let pingHallTid: Record<string, string> = $state({});
	let pingMessage: Record<string, string> = $state({});
	let pending = $derived(friendships.filter((f) => f.status === "pending"));
	let accepted = $derived(friendships.filter((f) => f.status === "accepted"));

	function hallName(hallTid: number | null): string {
		return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? "somewhere";
	}

	function otherUserId(f: Friendship, myId: string): string {
		return f.user_a === myId ? f.user_b : f.user_a;
	}

	async function refresh() {
		const supabase = page.data.supabase;
		const myId = page.data.session?.user.id;
		if (!supabase || !myId) return;

		const { data: fs } = await supabase.from("friendships").select("*").or(`user_a.eq.${myId},user_b.eq.${myId}`);
		friendships = fs ?? [];

		const otherIds = friendships.map((f) => otherUserId(f, myId));
		if (otherIds.length > 0) {
			const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", otherIds);
			profilesById = new Map((profs ?? []).map((p) => [p.user_id, p]));
		}

		const { data: pings } = await supabase.from("pings").select("*").eq("receiver_id", myId).order("created_at", { ascending: false });
		inbox = pings ?? [];
	}

	onMount(() => {
		refresh();

		const supabase = page.data.supabase;
		const myId = page.data.session?.user.id;
		if (!supabase || !myId) return;

		const channel = supabase
			.channel("pings-inbox")
			.on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter: `receiver_id=eq.${myId}` }, refresh)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	});

	async function search() {
		const supabase = page.data.supabase;
		const myId = page.data.session?.user.id;
		if (!supabase || !myId || query.trim().length === 0) {
			searchResults = [];
			return;
		}
		const { data } = await supabase.from("profiles").select("user_id, display_name").ilike("display_name", `%${query}%`).neq("user_id", myId).limit(10);
		searchResults = data ?? [];
	}

	async function requestFriend(targetUserId: string) {
		await page.data.supabase?.rpc("request_friendship", { target_user_id: targetUserId });
		searchResults = [];
		query = "";
		await refresh();
	}

	async function acceptFriend(f: Friendship) {
		await page.data.supabase?.from("friendships").update({ status: "accepted" }).eq("user_a", f.user_a).eq("user_b", f.user_b);
		await refresh();
	}

	async function sendPing(otherId: string) {
		const myId = page.data.session?.user.id;
		if (!page.data.supabase || !myId) return;
		const hallTid = pingHallTid[otherId] ? Number(pingHallTid[otherId]) : null;
		await page.data.supabase.from("pings").insert({ sender_id: myId, receiver_id: otherId, hall_tid: hallTid, message: pingMessage[otherId] || null });
		pingMessage[otherId] = "";
	}
</script>

<h1 class="page-title">Friends</h1>
<div class="label-rule mt-2 mb-6 text-gold-500"></div>

{#if !page.data.session}
	<div class="empty-state">
		<p>Sign in to add friends and send pings.</p>
	</div>
{:else}
	<!-- .card wraps the search box; .btn-primary is called out in app.css's own component-layer
	     comment as the "Add friend" example of a region's main action. -->
	<section class="card mb-6 p-4">
		<h2 class="section-title mb-3">Find friends</h2>
		<label class="field-label" for="friend-search">Search by name</label>
		<input id="friend-search" class="input mt-1 w-full sm:w-64" bind:value={query} oninput={search} placeholder="Search by name" />
		{#if searchResults.length > 0}
			<ul class="mt-3 space-y-2">
				{#each searchResults as p (p.user_id)}
					<li class="flex items-center justify-between gap-3">
						<span>{p.display_name}</span>
						<button class="btn btn-primary btn-sm" onclick={() => requestFriend(p.user_id)}>Add friend</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- .badge distinguishes "I'm waiting on them" (Pending) from "they're waiting on me" (Wants to
	     be friends + an Accept action) -- the pending/accepted visual clarity #39 asks for. -->
	<section class="mb-6">
		<h2 class="section-title mb-3">Friend requests</h2>
		{#if pending.length === 0}
			<div class="empty-state">No pending requests.</div>
		{:else}
			<ul class="space-y-2">
				{#each pending as f (f.user_a + f.user_b)}
					{@const myId = page.data.session.user.id}
					{@const other = profilesById.get(otherUserId(f, myId))}
					<li class="card flex items-center justify-between gap-3 p-3">
						<span>{other?.display_name ?? "…"}</span>
						{#if f.requested_by === myId}
							<span class="badge">Pending</span>
						{:else}
							<span class="flex items-center gap-2">
								<span class="badge">Wants to be friends</span>
								<button class="btn btn-primary btn-sm" onclick={() => acceptFriend(f)}>Accept</button>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="mb-6">
		<h2 class="section-title mb-3">Your friends</h2>
		{#if accepted.length === 0}
			<div class="empty-state">No friends yet — search above to add some.</div>
		{:else}
			<ul class="space-y-3">
				{#each accepted as f (f.user_a + f.user_b)}
					{@const myId = page.data.session.user.id}
					{@const otherId = otherUserId(f, myId)}
					{@const other = profilesById.get(otherId)}
					<li class="card p-3">
						<div class="flex flex-wrap items-center gap-2">
							<span class="badge">Friend</span>
							<strong>{other?.display_name ?? "…"}</strong>
						</div>
						<!-- .btn-secondary: app.css calls out "ping" by name as its equal-weight-alternative example. -->
						<div class="mt-3 flex flex-wrap items-end gap-2">
							<div>
								<label class="field-label" for={`hall-${otherId}`}>Hall</label>
								<select id={`hall-${otherId}`} class="input" bind:value={pingHallTid[otherId]}>
									<option value="">(no hall)</option>
									{#each DINING_HALLS as hall (hall.tid)}
										<option value={hall.tid}>{hall.name}</option>
									{/each}
								</select>
							</div>
							<div class="flex-1">
								<label class="field-label" for={`msg-${otherId}`}>Message (optional)</label>
								<input id={`msg-${otherId}`} class="input w-full" bind:value={pingMessage[otherId]} placeholder="message (optional)" />
							</div>
							<button class="btn btn-secondary btn-sm" onclick={() => sendPing(otherId)}>Ping "come eat with me"</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="section-title mb-3">Pings you've received</h2>
		{#if inbox.length === 0}
			<div class="empty-state">No pings yet.</div>
		{:else}
			<ul class="space-y-2">
				{#each inbox as p (p.id)}
					<li class="card p-3">
						<strong>{profilesById.get(p.sender_id)?.display_name ?? "Someone"}</strong> wants to eat
						{#if p.hall_tid}<span class="badge">{hallName(p.hall_tid)}</span>{/if}
						{#if p.message}<span class="block text-ink-900/70">&mdash; "{p.message}"</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}
