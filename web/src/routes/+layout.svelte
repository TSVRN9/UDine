<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import { page } from "$app/state";

	let { children } = $props();

	// Primary nav: only the destinations the vertical-slice/rank/filters/favorites e2e specs
	// actually click through by link text (getByRole("link", { name: ... })). Keep this list
	// exactly matched to those specs — adding/renaming an entry here is a locator-breaking change.
	const primaryNav = [
		{ href: "/today", label: "Today's macros" },
		{ href: "/filters", label: "Filters" },
		{ href: "/favorites", label: "Favorites" },
		{ href: "/rank", label: "Rank dishes" },
	];

	// Everything else — tucked behind a native <details> disclosure instead of a JS-driven drawer.
	const secondaryNav = [
		{ href: "/friends", label: "Friends" },
		{ href: "/notifications", label: "Notifications" },
		{ href: "/press", label: "Press" },
		{ href: "/events", label: "Events" },
		{ href: "/newsletter", label: "Newsletter" },
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

	async function signInWithGoogle() {
		if (!page.data.supabase) return;
		await page.data.supabase.auth.signInWithOAuth({
			provider: "google",
			options: { redirectTo: `${location.origin}/auth/callback` },
		});
	}

	async function signOut() {
		if (!page.data.supabase) return;
		await page.data.supabase.auth.signOut();
		location.reload();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-cream-100 text-ink-900">
	<header class="bg-maroon-900 text-paper-50">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
			<a href="/" class="font-display text-xl font-bold tracking-wide text-paper-50 no-underline">UDine</a>

			<nav class="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2 font-display text-sm tracking-wide uppercase">
				<a
					href="/"
					aria-current={isActive("/") ? "page" : undefined}
					class="text-paper-50/90 no-underline hover:text-gold-500 aria-[current=page]:text-gold-500"
				>
					Dining Halls
				</a>
				{#each primaryNav as item (item.href)}
					<a
						href={item.href}
						aria-current={isActive(item.href) ? "page" : undefined}
						class="text-paper-50/90 no-underline hover:text-gold-500 aria-[current=page]:text-gold-500"
					>
						{item.label}
					</a>
				{/each}

				<details class="relative">
					<summary class="cursor-pointer list-none text-paper-50/90 hover:text-gold-500">More &darr;</summary>
					<div class="absolute left-0 z-10 mt-2 flex min-w-40 flex-col gap-2 rounded-md bg-paper-50 p-3 text-ink-900 shadow-lg">
						{#each secondaryNav as item (item.href)}
							<a href={item.href} class="normal-case no-underline hover:text-maroon-600">{item.label}</a>
						{/each}
					</div>
				</details>
			</nav>

			<div class="font-body text-sm">
				{#if page.data.session}
					<span class="rounded-pill bg-paper-50/10 px-3 py-1 text-paper-50/90">
						{page.data.session.user.email}
					</span>
					<button
						onclick={signOut}
						class="rounded-pill bg-gold-500 px-3 py-1 font-semibold text-maroon-900 hover:bg-gold-500/90"
					>
						Sign out
					</button>
				{:else}
					<button
						onclick={signInWithGoogle}
						class="rounded-pill bg-gold-500 px-3 py-1 font-semibold text-maroon-900 hover:bg-gold-500/90"
					>
						Sign in with Google
					</button>
				{/if}
			</div>
		</div>
		<div class="label-rule text-gold-500"></div>
	</header>

	<main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
		{@render children()}
	</main>
</div>
