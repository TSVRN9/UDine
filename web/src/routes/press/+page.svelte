<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<a href="/">&larr; Dining Halls</a>
<h1>Press</h1>

{#if data.releases.length === 0}
	<p>No press releases right now.</p>
{/if}
<ul>
	{#each data.releases as release (release.url)}
		<li>
			{#if release.image}<img src={release.image} alt="" style="max-width:80px;vertical-align:middle" />{/if}
			<a href={release.url} target="_blank" rel="noreferrer">{release.title}</a>
			({release.date})
		</li>
	{/each}
</ul>
