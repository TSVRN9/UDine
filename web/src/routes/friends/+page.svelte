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

<h1>Friends</h1>

{#if !page.data.session}
	<p>Sign in to add friends and send pings.</p>
{:else}
	<h2>Find friends</h2>
	<input bind:value={query} oninput={search} placeholder="Search by name" />
	{#if searchResults.length > 0}
		<ul>
			{#each searchResults as p (p.user_id)}
				<li>{p.display_name} <button onclick={() => requestFriend(p.user_id)}>Add friend</button></li>
			{/each}
		</ul>
	{/if}

	<h2>Friend requests</h2>
	{#each friendships.filter((f) => f.status === "pending") as f (f.user_a + f.user_b)}
		{@const myId = page.data.session.user.id}
		{@const other = profilesById.get(otherUserId(f, myId))}
		<p>
			{other?.display_name ?? "..."}
			{#if f.requested_by === myId}
				(pending)
			{:else}
				wants to be friends <button onclick={() => acceptFriend(f)}>Accept</button>
			{/if}
		</p>
	{/each}

	<h2>Your friends</h2>
	{#each friendships.filter((f) => f.status === "accepted") as f (f.user_a + f.user_b)}
		{@const myId = page.data.session.user.id}
		{@const otherId = otherUserId(f, myId)}
		{@const other = profilesById.get(otherId)}
		<div>
			<strong>{other?.display_name ?? "..."}</strong>
			<select bind:value={pingHallTid[otherId]}>
				<option value="">(no hall)</option>
				{#each DINING_HALLS as hall (hall.tid)}
					<option value={hall.tid}>{hall.name}</option>
				{/each}
			</select>
			<input bind:value={pingMessage[otherId]} placeholder="message (optional)" />
			<button onclick={() => sendPing(otherId)}>Ping "come eat with me"</button>
		</div>
	{/each}

	<h2>Pings you've received</h2>
	{#if inbox.length === 0}
		<p>No pings yet.</p>
	{:else}
		<ul>
			{#each inbox as p (p.id)}
				<li>
					{profilesById.get(p.sender_id)?.display_name ?? "Someone"} wants to eat {p.hall_tid ? `at ${hallName(p.hall_tid)}` : ""}
					{#if p.message}&mdash; "{p.message}"{/if}
				</li>
			{/each}
		</ul>
	{/if}
{/if}
