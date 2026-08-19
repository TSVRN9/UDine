<script lang="ts">
	import { page } from "$app/state";

	// Every +page.ts in this app `throw error(...)`s when its upstream fetch fails, and most of those
	// upstreams are umassdining.com — which is down, slow or rate-limiting often enough that "the
	// menu didn't load" is a normal state, not an exceptional one. Say which, and offer the two
	// things that actually help: retry, or go somewhere that works without the network.
	const isUpstream = $derived(page.status >= 500 || page.error?.message?.includes("failed to load"));
</script>

<div class="mx-auto max-w-xl py-10 text-center">
	<p class="font-mono text-sm tracking-widest text-ink-900/50">ERROR {page.status}</p>
	<h1 class="page-title mt-2">
		{#if page.status === 404}
			Not on the menu
		{:else if isUpstream}
			Couldn&rsquo;t reach UMass Dining
		{:else}
			Something went wrong
		{/if}
	</h1>
	<div class="label-rule mx-auto mt-3 w-24 text-gold-500"></div>

	<p class="mt-5 text-ink-900/70">
		{#if page.status === 404}
			That page doesn&rsquo;t exist. It may have moved, or the link may be mistyped.
		{:else if isUpstream}
			Menus, events and press releases come straight from umassdining.com, and it didn&rsquo;t answer.
			This is usually temporary &mdash; try again in a moment.
		{:else}
			{page.error?.message ?? "An unexpected error occurred."}
		{/if}
	</p>

	<div class="mt-6 flex flex-wrap justify-center gap-3">
		<button class="btn btn-primary" onclick={() => location.reload()}>Try again</button>
		<a class="btn btn-secondary no-underline" href="/">Back to dining halls</a>
	</div>

	<p class="mt-8 text-sm text-ink-900/60">
		Your logged meals and macros are stored in this browser, so
		<a href="/today">Today&rsquo;s macros</a> still works while UMass Dining is unreachable.
	</p>
</div>
