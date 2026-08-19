<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<h1>Newsletter</h1>

{#if data.issues.length === 0}
	<p>No newsletter issues right now.</p>
{/if}
<ul>
	{#each data.issues as issue, i (`${issue.link}-${i}`)}
		<li>
			<a href={issue.link} target="_blank" rel="noreferrer">{issue.period}</a>
		</li>
	{/each}
</ul>
