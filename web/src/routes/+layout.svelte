<script lang="ts">
	import "../app.css";
	import favicon from "$lib/assets/favicon.svg";
	import { navigating, page } from "$app/state";
	import { ownPushToken, clearStoredPushTokens } from "$lib/pushTokens";
	import { pendingSelfHeal } from "$lib/pendingSelfHeal";

	// No shared web withTimeout helper; this is a Promise.race with a timer, matching mobile's
	// SIGN_OUT_STEP_TIMEOUT_MS in spirit.
	const SELF_HEAL_WAIT_TIMEOUT_MS = 15000;

	let { children } = $props();

	// e2e specs click these by link text (substring match), so renaming an entry or adding one
	// whose label contains an existing label breaks/ambiguates those locators.
	//
	// Friends/Notifications live here rather than behind the disclosure below: they carry incoming,
	// time-sensitive content (a friend request, a favorited dish spotted today), unlike the static
	// read-only content behind it.
	const primaryNav = [
		{ href: "/today", label: "Today's macros" },
		{ href: "/rank", label: "Rank dishes" },
		{ href: "/favorites", label: "Favorites" },
		{ href: "/filters", label: "Filters" },
		{ href: "/friends", label: "Friends" },
		{ href: "/notifications", label: "Notifications" },
	];

	// Read-only content from UMass Dining — no user state, nothing time-critical. Tucked behind a
	// native <details> disclosure instead of a JS-driven drawer.
	const diningInfoNav = [
		{ href: "/press", label: "Press" },
		{ href: "/events", label: "Events" },
		{ href: "/newsletter", label: "Newsletter" },
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href;
	}

	let signingIn = $state(false);

	async function signInWithGoogle() {
		if (!page.data.supabase) return;
		signingIn = true;
		const { error } = await page.data.supabase.auth.signInWithOAuth({
			provider: "google",
			options: { redirectTo: `${location.origin}/auth/callback` },
		});
		// On success the browser is already navigating away, so this only ever runs on failure —
		// without it the button sits in a permanent "Signing in…" state with no explanation.
		if (error) signingIn = false;
	}

	// The push_tokens delete has to happen BEFORE auth.signOut(): once the session is gone, RLS no
	// longer lets this browser touch that row. Best-effort and scoped to this browser's own
	// subscription only (never a blanket "every device" delete) -- a failure here must not strand
	// the user mid sign-out.
	//
	// Deliberately does NOT flip notifications_enabled to false -- that's the user's stored
	// preference for signing back in, not device-scoped state. Mirrors mobile/src/lib/auth.ts's
	// signOut().
	async function signOut() {
		const supabase = page.data.supabase;
		if (!supabase) return;
		const userId = page.data.session?.user.id;
		if (userId) {
			// notifications/+page.svelte's self-heal (re-upserting this browser's push_tokens row)
			// can still be mid-flight when the user clicks "Sign out". Waiting for it HERE, before
			// this function's own delete and before auth.signOut(), avoids a race where a post-signOut
			// upsert would 403 (session gone) while a pre-signOut one would resurrect the row this
			// delete just removed. Bounded so a hung self-heal can't hang sign-out; a self-heal
			// request already in flight when the wait times out can still land afterward -- the
			// server-side unique-token constraint on push_tokens is the backstop for that sliver.
			const pending = pendingSelfHeal();
			if (pending) {
				await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, SELF_HEAL_WAIT_TIMEOUT_MS))]);
			}
			try {
				const ownToken = await ownPushToken();
				if (ownToken) await clearStoredPushTokens(supabase, userId, ownToken);
			} catch (err) {
				console.error("Push token cleanup failed on sign-out:", err);
			}
		}
		await supabase.auth.signOut();
		location.reload();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col bg-cream-100 text-ink-900">
	<a
		href="#main"
		class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-paper-50 focus:px-3 focus:py-2 focus:font-semibold"
	>
		Skip to content
	</a>

	<header class="bg-maroon-900 text-paper-50">
		<div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-3 sm:px-6">
			<a href="/" class="font-display text-xl font-bold tracking-wide text-paper-50 no-underline">UDine</a>

			<div class="flex flex-wrap items-center gap-2 font-body text-sm">
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
						disabled={signingIn}
						class="rounded-pill bg-gold-500 px-3 py-1 font-semibold text-maroon-900 hover:bg-gold-500/90 disabled:opacity-60"
					>
						{signingIn ? "Signing in…" : "Sign in with Google"}
					</button>
				{/if}
			</div>
		</div>

		<!-- One nav element, wrapping — not a desktop/mobile pair, which would put two links with the
		     same name in the DOM and break e2e nav clicks on strict mode. -->
		<nav
			aria-label="Main"
			class="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 font-display text-sm tracking-wide uppercase sm:px-6"
		>
			{#each primaryNav as item (item.href)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? "page" : undefined}
					class="border-b-2 border-transparent text-paper-50/90 no-underline hover:text-gold-500 aria-[current=page]:border-gold-500 aria-[current=page]:text-gold-500"
				>
					{item.label}
				</a>
			{/each}
			<a
				href="/"
				aria-current={isActive("/") ? "page" : undefined}
				class="border-b-2 border-transparent text-paper-50/90 no-underline hover:text-gold-500 aria-[current=page]:border-gold-500 aria-[current=page]:text-gold-500"
			>
				Dining Halls
			</a>

			<!-- Keyed on the path so a client-side navigation destroys and recreates the <details>,
			     which is what actually closes it — a <details> holds `open` across SvelteKit's
			     client-side nav, so the menu used to stay hanging over the page you just opened. -->
			{#key page.url.pathname}
				<details class="relative">
					<summary
						class="cursor-pointer list-none border-b-2 border-transparent text-paper-50/90 hover:text-gold-500"
					>
						Dining Info &darr;
					</summary>
					<div
						class="absolute left-0 z-10 mt-2 flex min-w-44 flex-col gap-2 rounded-md border border-ink-900/10 bg-paper-50 p-3 font-body text-sm normal-case tracking-normal text-ink-900 shadow-lg"
					>
						{#each diningInfoNav as item (item.href)}
							<a href={item.href} class="no-underline hover:text-maroon-600">{item.label}</a>
						{/each}
					</div>
				</details>
			{/key}
		</nav>

		<div class="label-rule text-gold-500"></div>

		<!-- Navigation loading indicator: every route's `load` fetches from umassdining.com through
		     /api/*, so this covers the wait. Not role="status" -- each page already has one for its
		     own log/save toast, and a second would make those locators ambiguous. -->
		<div class="h-1 {navigating.to ? 'animate-pulse bg-gold-500' : ''}" aria-hidden="true"></div>
	</header>

	<main id="main" class="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
		{@render children()}
	</main>

	<footer class="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
		<div class="label-rule text-ink-900/20"></div>
		<p class="pt-3 text-xs text-ink-900/60">
			What you eat stays on this device. Your food log, macro history and dish rankings live in this
			browser only &mdash; export them any time from Today&rsquo;s macros. Signing in adds friends, pings and
			favorited-dish alerts, and nothing else.
		</p>
	</footer>
</div>
