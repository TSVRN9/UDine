<script lang="ts">
	import { onMount } from "svelte";
	import {
		favoriteKey,
		htmlToText,
		nowLocalIso,
		openStatus,
		parseRetailMenuHtml,
		type Favorite,
		type FoodPreferences,
		type LogEntry,
		type MealPeriod,
		type MenuItem,
		type ParsedRetailMenu,
		type RetailLocationHours,
	} from "@udine/shared";
	import { IndexedDbLogStorage } from "$lib/indexedDbStorage";
	import { IndexedDbFavoritesStorage } from "$lib/favoritesStorage";
	import DishList from "$lib/DishList.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const favoritesStorage = new IndexedDbFavoritesStorage();

	// #178: café menus don't wire up dietary filters yet -- halls-menu.spec.ts's "everything is
	// filtered out" case exists precisely because silently hiding every dish behind a filter with no
	// explanation reads as a bug (see halls/[slug]/+page.svelte's hiddenCount banner). Doing that
	// right here needs the same banner; out of #178's own ask (probe-at-tap navigation + price +
	// fallback sheet + inline PDF), so left as a real, disclosed gap rather than silently filtering
	// with no way to tell why a menu came back empty.
	const prefs: FoodPreferences = { allergensToAvoid: [], requiredDietTags: [] };

	let servings: Record<string, number> = $state({});
	let favoriteDishKeys: Set<string> = $state(new Set());
	let loggedMessage = $state("");
	let showPdf = $state(false);

	// Same seeding rule as halls/[slug]/+page.svelte: existence check (`in`), not `??=`, so clearing
	// an input to blank doesn't get stomped back to 1.
	$effect(() => {
		for (const item of data.items) if (!(item.dishName in servings)) servings[item.dishName] = 1;
	});

	onMount(async () => {
		const favorites = await favoritesStorage.getFavorites();
		favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
	});

	async function toggleFavoriteDish(dishName: string) {
		const favorite: Favorite = { type: "dish", dishName };
		const key = favoriteKey(favorite);
		if (favoriteDishKeys.has(key)) {
			await favoritesStorage.removeFavorite(favorite);
		} else {
			await favoritesStorage.addFavorite(favorite);
		}
		const favorites = await favoritesStorage.getFavorites();
		favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
	}

	async function logItem(item: MenuItem) {
		const qty = Number(servings[item.dishName]) || 1;
		const entry: LogEntry = {
			id: crypto.randomUUID(),
			loggedAt: nowLocalIso(),
			source: { type: "umass-menu", dishName: item.dishName, hallTid: item.hallTid },
			servings: qty,
			nutrition: item.nutrition,
		};
		await storage.addEntry(entry);
		loggedMessage = `Logged ${qty} × ${item.dishName}`;
		setTimeout(() => (loggedMessage = ""), 2000);
	}

	// #175: a café's items can carry retail-only periods ("allday"/"grabngo") that MEAL_PERIODS
	// (the hall-tab consolidation) deliberately excludes. Only render sections for periods this
	// café's items actually use, in a fixed, readable order -- not alphabetical/insertion order,
	// which would jitter section order across days for no reason.
	const PERIOD_ORDER: MealPeriod[] = ["breakfast", "lunch", "dinner", "latenight", "allday", "grabngo"];
	const periods = $derived(PERIOD_ORDER.filter((p) => data.items.some((i) => i.mealPeriod === p)));

	// #178: the fallback sheet's standing menu merges all three *_menu fields (a café publishes at
	// most a couple of these on any given day per the real captures in hours.test.ts) -- a PDF link
	// in any of them wins outright (babyBerk/Commonwealth Restaurant only ever populate one field
	// with a PDF, never mix a PDF with a real item list), otherwise every parsed item list is
	// concatenated into one card.
	function standingMenuFor(cafe: RetailLocationHours): ParsedRetailMenu {
		const parsed = [cafe.breakfastMenu, cafe.lunchMenu, cafe.dinnerMenu].map(parseRetailMenuHtml);
		const pdf = parsed.find((p) => p.kind === "pdf");
		if (pdf) return pdf;
		const items = parsed.flatMap((p) => (p.kind === "items" ? p.items : []));
		return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
	}
	const standingMenu = $derived(standingMenuFor(data.cafe));

	// Reuses the shared, already-tested openStatus/DiningHallHours math instead of a bespoke
	// retail-status helper -- a café only ever publishes one "general" window (RetailLocationHours.
	// hours), so it's just openStatus fed a DiningHallHours with every per-meal field null.
	const status = $derived(
		openStatus({ hallTid: data.cafe.locationId ?? 0, breakfast: null, lunch: null, dinner: null, latenight: null, general: data.cafe.hours }, new Date()),
	);
	function formatTime(d: Date): string {
		return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase();
	}
	const statusLabel = $derived(
		status.open
			? `OPEN · TIL ${formatTime(status.closesAt)}`
			: status.opensAt
				? `CLOSED · OPENS ${formatTime(status.opensAt)}`
				: "CLOSED",
	);

	// "lat,long" as published, not parsed elsewhere (#176's own doc comment on RetailLocationHours.
	// mapAddress -- babyBerk's real capture is the degenerate literal "," with no real coordinates).
	// Validated here, at the one render site that turns it into a live link, rather than upstream.
	const mapsUrl = $derived.by(() => {
		const raw = data.cafe.mapAddress?.trim();
		if (!raw || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(raw)) return null;
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
	});

	const description = $derived(htmlToText(data.cafe.description));
</script>

<header>
	<p class="font-mono text-xs tracking-widest text-ink-900/50 uppercase">
		<a href="/" class="no-underline hover:underline">All halls</a>
	</p>
	<h1 class="page-title mt-1">{data.cafe.name}</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
</header>

{#if data.items.length > 0}
	<!-- #177/#178 runtime model: non-empty fetchMenu -> the ordinary menu screen (nutrition +
	     price, loggable). This is the ONLY state that ever presents a daily menu -- there is no
	     "menu but no nutrition" tier. -->
	<DishList items={data.items} {periods} {prefs} {favoriteDishKeys} {servings} onToggleFavorite={toggleFavoriteDish} onLog={logItem} />
{:else}
	<!-- #177/#178 runtime model: empty fetchMenu -> the fallback sheet. Structured the same way the
	     styling spec ("Cafe fallback (menu not posted)") describes for mobile -- status pill,
	     description, standing menu (if any, clearly labeled as NOT today's menu), location, payment. -->
	<section class="card mt-6 px-5 py-5" data-testid="cafe-fallback-sheet">
		<div class="flex flex-wrap items-center gap-2">
			<span class="badge bg-gold-500 text-maroon-900">{statusLabel}</span>
			<span class="text-xs text-ink-900/55">UMass Amherst</span>
		</div>

		{#if description}
			<p class="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-900/70">{description}</p>
		{/if}

		{#if standingMenu.kind !== "empty"}
			<div class="mt-4 overflow-hidden rounded-md border border-ink-900/10">
				<div class="bg-gold-500/12 px-3.5 py-2">
					<p class="font-display text-xs font-semibold tracking-[0.12em] text-maroon-900 uppercase">Menu</p>
					<!-- Exact copy per #177/#178's styling spec -- never presented as today's menu. -->
					<p class="mt-0.5 text-[0.65rem] text-ink-900/50">
						today's menu isn't posted yet — standing menu from umassdining.com
					</p>
				</div>

				{#if standingMenu.kind === "pdf"}
					<div class="px-3.5 py-3">
						<button onclick={() => (showPdf = true)} class="btn btn-secondary btn-sm">
							View {standingMenu.label}
						</button>
					</div>
				{:else}
					<ul class="divide-y divide-ink-900/8">
						{#each standingMenu.items as item (item.name)}
							<li class="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
								<span>{item.name}</span>
								{#if item.price}<span class="font-mono text-xs font-semibold text-maroon-600">{item.price}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<div class="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-ink-900/10 pt-3">
			<div>
				<p class="text-sm font-semibold text-maroon-900">{data.cafe.name}</p>
				<p class="text-xs text-ink-900/55">UMass Amherst</p>
			</div>
			{#if mapsUrl}
				<a href={mapsUrl} target="_blank" rel="noreferrer" class="text-xs font-semibold tracking-wide text-maroon-600 no-underline hover:underline">
					DIRECTIONS ↗
				</a>
			{/if}
		</div>

		{#if data.cafe.acceptedPayment}
			<p class="mt-3 border-t border-ink-900/10 pt-3 text-xs leading-relaxed text-ink-900/55">
				{data.cafe.acceptedPayment}
			</p>
		{/if}
	</section>
{/if}

{#if loggedMessage}
	<div class="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
		<p role="status" class="pointer-events-auto rounded-md bg-maroon-900 px-4 py-2 text-sm font-semibold text-paper-50 shadow-lg">
			{loggedMessage}
		</p>
	</div>
{/if}

{#if showPdf && standingMenu.kind === "pdf"}
	<!-- #178 PDF spec: full-screen dark chrome, cream document sheet, "Rendered in-app" hint. Native
	     browser PDF rendering via <object> (see PR body for why this beats pdf.js/<embed> here) --
	     gives scroll+zoom for free, no new dependency, and this <object> itself is genuinely in-app
	     (it's embedded content on this page, not a navigation).
	     #178 pr-review: the SAVE link is a DIFFERENT case -- `download` is only honored same-origin;
	     the PDF is served from umassdining.com, so a bare `<a href download>` there silently falls
	     back to a normal navigation, and clicking SAVE would have replaced this whole app (unloading
	     it) with the browser's native full-page PDF view -- exactly the "bounce to an external
	     viewer" #177 forbids, just same-tab instead of new-tab. Proxying the PDF bytes through our
	     own origin (so `download` actually forces a save, no navigation) is the fully-correct fix and
	     is filed as a follow-up (see PR body) rather than done here. `target="_blank"` is the interim
	     fix: SAVE still opens the PDF in a new tab (browser's own viewer, from which the user can
	     genuinely save/print), but the app in THIS tab is never unloaded -- the in-app <object> above
	     stays the primary viewing path, SAVE is an explicit, secondary, clearly-labeled export action.
	     Same reasoning applies to the <object> fallback link (only rendered when a browser has no PDF
	     renderer at all -- rare, but the same "don't unload the app" rule should still hold). -->
	<div class="fixed inset-0 z-50 flex flex-col bg-maroon-900 text-paper-50">
		<div class="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
			<div class="flex min-w-0 items-start gap-3">
				<button onclick={() => (showPdf = false)} aria-label="Back" class="shrink-0 text-2xl leading-none text-paper-50">&larr;</button>
				<div class="min-w-0">
					<p class="truncate font-display text-xl font-bold tracking-wide uppercase">{data.cafe.name}</p>
					<p class="mt-0.5 text-xs text-paper-50/55">Menu · PDF</p>
				</div>
			</div>
			<a
				href={standingMenu.url}
				download
				target="_blank"
				rel="noreferrer"
				class="shrink-0 rounded-sm border border-paper-50/30 px-3 py-1.5 text-xs font-semibold tracking-wide text-paper-50/85 no-underline hover:bg-paper-50/10"
			>
				SAVE
			</a>
		</div>

		<object
			data={standingMenu.url}
			type="application/pdf"
			title="{data.cafe.name} menu PDF"
			class="mx-3.5 min-h-0 flex-1 rounded-t-md bg-paper-50"
		>
			<p class="p-4 text-sm text-ink-900">
				Your browser can't preview this PDF inline.
				<a href={standingMenu.url} target="_blank" rel="noreferrer" class="font-semibold text-maroon-600">Open {standingMenu.label}</a>
			</p>
		</object>

		<p class="bg-maroon-900/95 px-5 py-4 text-center text-xs text-paper-50/60">Rendered in-app · pinch to zoom · scroll for pages</p>
	</div>
{/if}
