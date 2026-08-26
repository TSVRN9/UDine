<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { createLatestWins } from "@udine/shared";
	import { runFriendSearch, type Profile } from "$lib/friendSearch";
	type Friendship = { user_a: string; user_b: string; status: "pending" | "accepted"; requested_by: string };

	// #192: an earlier, slower search response landing after a faster later one must not clobber
	// the newer results.
	const searchGuard = createLatestWins();

	let query = $state("");
	let searchResults: Profile[] = $state([]);
	let friendships: Friendship[] = $state([]);
	let profilesById: Map<string, Profile> = $state(new Map());
	let pending = $derived(friendships.filter((f) => f.status === "pending"));
	let accepted = $derived(friendships.filter((f) => f.status === "accepted"));
	let requestError = $state(false);

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
	}

	onMount(refresh);

	async function search() {
		const supabase = page.data.supabase;
		const myId = page.data.session?.user.id;
		if (!supabase || !myId || query.trim().length === 0) {
			searchResults = [];
			return;
		}
		const results = await runFriendSearch(searchGuard, () => supabase.from("profiles").select("user_id, display_name").ilike("display_name", `%${query}%`).neq("user_id", myId).limit(10));
		if (results !== null) searchResults = results;
	}

	async function requestFriend(targetUserId: string) {
		const { error } = (await page.data.supabase?.rpc("request_friendship", { target_user_id: targetUserId })) ?? {};
		if (error) {
			requestError = true;
			setTimeout(() => (requestError = false), 3000);
			return;
		}
		requestError = false;
		searchResults = [];
		query = "";
		await refresh();
	}

	async function acceptFriend(f: Friendship) {
		await page.data.supabase?.from("friendships").update({ status: "accepted" }).eq("user_a", f.user_a).eq("user_b", f.user_b);
		await refresh();
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
		{#if requestError}<p role="alert" class="badge mt-2">Couldn't send friend request — try again.</p>{/if}
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

	<section>
		<h2 class="section-title mb-3">Your friends</h2>
		{#if accepted.length === 0}
			<div class="empty-state">No friends yet — search above to add some.</div>
		{:else}
			<!-- No ping controls here (#66) -- pinging a friend is a first-class action on the
			     Notifications activity feed now, not buried in this list. -->
			<ul class="space-y-2">
				{#each accepted as f (f.user_a + f.user_b)}
					{@const myId = page.data.session.user.id}
					{@const other = profilesById.get(otherUserId(f, myId))}
					<li class="card flex items-center gap-2 p-3">
						<span class="badge">Friend</span>
						<strong>{other?.display_name ?? "…"}</strong>
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-sm text-ink-900/60">
				Want to say "come eat with me"? Ping friends from the <a href="/notifications">Notifications feed</a>.
			</p>
		{/if}
	</section>
{/if}
