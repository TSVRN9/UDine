<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<header>
	<h1 class="page-title">Press</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">Press releases from UMass Dining.</p>
</header>

{#if data.releases.length === 0}
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">No press releases right now.</p>
		<p class="mt-2 text-sm">UMass Dining posts these periodically &mdash; check back later.</p>
	</div>
{:else}
	<ul class="mt-6 flex flex-col gap-3">
		{#each data.releases as release, i (i + release.title)}
			<li class="card flex items-center gap-4 px-4 py-4">
				{#if release.image}
					<img src={release.image} alt="" class="h-16 w-16 shrink-0 rounded-sm bg-cream-100 object-contain" />
				{/if}
				<div class="min-w-0 flex-1">
					{#if release.url}
						<a
							href={release.url}
							target="_blank"
							rel="noreferrer"
							class="font-display text-lg font-semibold text-maroon-900 hover:text-maroon-600"
						>
							{release.title}
						</a>
					{:else}
						<span class="font-display text-lg font-semibold text-maroon-900">{release.title}</span>
					{/if}
					<p class="mt-0.5 font-mono text-xs tracking-widest text-ink-900/50 uppercase">{release.date}</p>
				</div>
			</li>
		{/each}
	</ul>
{/if}
