<script lang="ts">
	import type { PageProps } from "./$types";
	let { data }: PageProps = $props();
</script>

<header>
	<h1 class="page-title">Events</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">Dining hall events from UMass Dining.</p>
</header>

{#if data.events.length === 0}
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">No events right now.</p>
		<p class="mt-2 text-sm">Check back later for dining hall events.</p>
	</div>
{:else}
	<ul class="mt-6 flex flex-col gap-3">
		{#each data.events as event (event.title + event.expirationDate)}
			<li class="card flex items-center gap-4 px-4 py-4">
				{#if event.featuredImage}
					<!-- UMass Dining's event images are wide banners (~1024x432), not square thumbnails like
					     press logos -- a fixed square with object-cover crops most of the banner off.
					     w-28 + object-contain shows the whole image instead of guessing a crop. -->
					<img src={event.featuredImage} alt="" class="h-16 w-28 shrink-0 rounded-sm bg-cream-100 object-contain" />
				{/if}
				<div class="min-w-0 flex-1">
					<p class="font-display text-lg font-semibold text-maroon-900">
						{#if event.isFeatured}<span class="badge mr-2 bg-gold-500/20 text-maroon-900">Featured</span>{/if}
						{event.title}
					</p>
					{#if event.pdfLink || event.externalLink}
						<p class="mt-1 flex flex-wrap gap-3 text-sm">
							{#if event.pdfLink}
								<a href={event.pdfLink} target="_blank" rel="noreferrer">Details</a>
							{/if}
							{#if event.externalLink}
								<a href={event.externalLink} target="_blank" rel="noreferrer">More info</a>
							{/if}
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
