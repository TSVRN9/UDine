<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<h1>Events</h1>

{#if data.events.length === 0}
	<p>No events right now.</p>
{/if}
<ul>
	{#each data.events as event (event.title + event.expirationDate)}
		<li>
			{#if event.isFeatured}<strong>★</strong>{/if}
			{#if event.featuredImage}<img src={event.featuredImage} alt="" style="max-width:80px;vertical-align:middle" />{/if}
			{event.title}
			{#if event.pdfLink}<a href={event.pdfLink} target="_blank" rel="noreferrer">(details)</a>{/if}
			{#if event.externalLink}<a href={event.externalLink} target="_blank" rel="noreferrer">(link)</a>{/if}
		</li>
	{/each}
</ul>
