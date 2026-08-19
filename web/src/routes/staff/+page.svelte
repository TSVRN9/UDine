<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<h1>Staff Directory</h1>

{#if data.staff.length === 0}
	<p>No staff listed right now.</p>
{/if}
{#each data.staff as member, i (`${member.email || member.name}-${i}`)}
	<div style="display:flex;gap:12px;margin-bottom:16px">
		{#if member.profileImage}<img src={member.profileImage} alt="" style="max-width:80px;border-radius:4px" />{/if}
		<div>
			<h3 style="margin-bottom:2px">{member.name}</h3>
			<p style="margin:0;color:#555">{member.title}{#if member.department} &middot; {member.department}{/if}</p>
			{#if member.email}<p style="margin:2px 0"><a href="mailto:{member.email}">{member.email}</a></p>{/if}
			{#if member.bio}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html member.bio}
			{/if}
		</div>
	</div>
{/each}
