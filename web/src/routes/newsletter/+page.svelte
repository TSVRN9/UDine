<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<header>
	<h1 class="page-title">Newsletter</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">UMass Dining&rsquo;s newsletter archive.</p>
</header>

{#if data.issues.length === 0}
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">No newsletter issues right now.</p>
		<p class="mt-2 text-sm">Check back later for the next issue.</p>
	</div>
{:else}
	<ul class="mt-6 flex flex-col gap-2">
		{#each data.issues as issue, i (`${issue.link}-${i}`)}
			<li class="card px-4 py-3">
				<a
					href={issue.link}
					target="_blank"
					rel="noreferrer"
					class="font-display font-semibold text-maroon-900 hover:text-maroon-600"
				>
					{issue.period}
				</a>
			</li>
		{/each}
	</ul>
{/if}
