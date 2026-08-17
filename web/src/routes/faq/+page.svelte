<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<a href="/">&larr; Dining Halls</a>
<h1>FAQ</h1>

{#each data.categories as category (category.name)}
	<h2>{category.name}</h2>
	{#each category.items as item (item.title)}
		<h3>{item.title}</h3>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html item.content}
	{/each}
{/each}
