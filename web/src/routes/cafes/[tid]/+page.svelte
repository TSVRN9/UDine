<script lang="ts">
	import { onMount } from "svelte";
	import {
		favoriteKey,
		htmlToText,
		menuItemMatchesPreferences,
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
	import { loadPreferences } from "$lib/preferences";
	import DishList from "$lib/DishList.svelte";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	const storage = new IndexedDbLogStorage();
	const favoritesStorage = new IndexedDbFavoritesStorage();

	let prefs: FoodPreferences = $state({ allergensToAvoid: [], requiredDietTags: [] });

	// Same "don't silently render fewer dishes than the filters removed" rationale as
	// halls/[slug]/+page.svelte's hiddenCount.
	const hiddenCount = $derived(data.items.filter((i) => !menuItemMatchesPreferences(i, prefs)).length);

	let servings: Record<string, number> = $state({});
	let favoriteDishKeys: Set<string> = $state(new Set());
	let loggedMessage = $state("");
	let showPdf = $state(false);
	// Set when an IndexedDB read/write fails below, so the favorite-star toggle and log-a-dish
	// writes don't just silently no-op on a blocked/failed open.
	let dbError = $state(false);

	// Same seeding rule as halls/[slug]/+page.svelte: existence check (`in`), not `??=`, so clearing
	// an input to blank doesn't get stomped back to 1.
	$effect(() => {
		for (const item of data.items) if (!(item.dishName in servings)) servings[item.dishName] = 1;
	});

	onMount(async () => {
		prefs = loadPreferences();
		try {
			const favorites = await favoritesStorage.getFavorites();
			favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
		} catch {
			dbError = true;
		}
	});

	// Whole body in one try/catch, not just the write -- catching only the write and still
	// unconditionally re-reading would let a succeeding read reset dbError right after it was set.
	async function toggleFavoriteDish(dishName: string) {
		const favorite: Favorite = { type: "dish", dishName };
		const key = favoriteKey(favorite);
		try {
			if (favoriteDishKeys.has(key)) {
				await favoritesStorage.removeFavorite(favorite);
			} else {
				await favoritesStorage.addFavorite(favorite);
			}
			const favorites = await favoritesStorage.getFavorites();
			favoriteDishKeys = new Set(favorites.filter((f) => f.type === "dish").map(favoriteKey));
		} catch {
			dbError = true;
		}
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
		try {
			await storage.addEntry(entry);
		} catch {
			dbError = true;
			return;
		}
		loggedMessage = `Logged ${qty} × ${item.dishName}`;
		setTimeout(() => (loggedMessage = ""), 2000);
	}

	// A café's items can carry retail-only periods ("allday"/"grabngo") that MEAL_PERIODS (the
	// hall-tab consolidation) excludes. Only render sections a café's items actually use, in a
	// fixed order -- not alphabetical/insertion order, which would jitter across days.
	const PERIOD_ORDER: MealPeriod[] = ["breakfast", "lunch", "dinner", "latenight", "allday", "grabngo"];
	const periods = $derived(PERIOD_ORDER.filter((p) => data.items.some((i) => i.mealPeriod === p)));

	// The fallback sheet's standing menu merges all three *_menu fields (a café publishes at most a
	// couple on any given day) -- a PDF link in any of them wins outright (a café never mixes a PDF
	// with a real item list), otherwise every parsed item list is concatenated into one card.
	function standingMenuFor(cafe: RetailLocationHours): ParsedRetailMenu {
		const parsed = [cafe.breakfastMenu, cafe.lunchMenu, cafe.dinnerMenu].map(parseRetailMenuHtml);
		const pdf = parsed.find((p) => p.kind === "pdf");
		if (pdf) return pdf;
		const items = parsed.flatMap((p) => (p.kind === "items" ? p.items : []));
		return items.length > 0 ? { kind: "items", items } : { kind: "empty" };
	}
	const standingMenu = $derived(standingMenuFor(data.cafe));

	// Fetches the PDF through /api/pdf (same-origin proxy) and downloads the resulting blob via a
	// synthetic same-origin anchor -- a real save, no navigation. Filename comes from the proxy's
	// own Content-Disposition header rather than re-deriving it here.
	async function savePdf(pdfUrl: string) {
		try {
			const res = await fetch(`/api/pdf?url=${encodeURIComponent(pdfUrl)}`);
			if (!res.ok) throw new Error(`pdf proxy responded ${res.status}`);
			const filename = /filename="?([^"]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "menu.pdf";
			const blobUrl = URL.createObjectURL(await res.blob());
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = filename;
			link.click();
			URL.revokeObjectURL(blobUrl);
		} catch {
			// Best-effort fallback if the proxy is unreachable, rather than leaving SAVE silently dead.
			// Not guaranteed -- running after an `await` means some browsers' popup blockers may treat
			// it as no longer user-initiated and block it.
			window.open(pdfUrl, "_blank", "noreferrer");
		}
	}

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

	// "lat,long" as published; some cafes publish the degenerate literal "," with no real
	// coordinates, so this is validated here, the one render site that turns it into a live link.
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

{#if dbError}
	<p role="alert" class="badge mt-4">
		Couldn't save — try closing other UDine tabs and reloading this page.
	</p>
{/if}

{#if hiddenCount > 0 && hiddenCount < data.items.length}
	<p class="mt-4 rounded-md border border-gold-500/50 bg-gold-500/10 px-4 py-3 text-sm">
		Your dietary filters are hiding {hiddenCount}
		{hiddenCount === 1 ? "dish" : "dishes"} on today's menu.
		<a href="/filters" class="font-semibold">Edit dietary preferences</a>
	</p>
{/if}

{#if data.items.length > 0 && hiddenCount === data.items.length}
	<!-- A menu exists but the user's own filters removed all of it -- same as halls/[slug]/+page.svelte. -->
	<div class="empty-state mt-6">
		<p class="font-display text-lg uppercase">Everything is filtered out</p>
		<p class="mt-2 text-sm">
			All {data.items.length} dishes on today's menu conflict with your dietary filters.
		</p>
		<p class="mt-4"><a href="/filters" class="btn btn-secondary no-underline">Edit dietary preferences</a></p>
	</div>
{:else if data.items.length > 0}
	<!-- A non-empty menu is the only state that presents a daily menu -- no "menu but no nutrition" tier. -->
	<DishList items={data.items} {periods} {prefs} {favoriteDishKeys} {servings} onToggleFavorite={toggleFavoriteDish} onLog={logItem} />
{:else}
	<!-- Empty menu -> fallback sheet: status pill, description, standing menu (if any, clearly
	     labeled as NOT today's menu), location, payment. -->
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
	<!-- Native browser PDF rendering via <object> gives scroll+zoom for free with no new dependency,
	     and is genuinely in-app (embedded content, not a navigation).
	     SAVE fetches the PDF through our own same-origin /api/pdf proxy and downloads the bytes via
	     a synthetic same-origin <a download>, not the upstream umassdining.com URL directly --
	     `download` is only honored same-origin, so a bare cross-origin anchor either navigates the
	     whole app away or just opens a new tab, neither of which is a real download. A plain
	     `<a href="/api/pdf?..." download>` would also work, but a bare anchor click hands the
	     request straight to the browser's download manager, bypassing fetch/network — invisible to
	     page.route() in the e2e suite. Fetching the bytes ourselves keeps the request on the same
	     fetch() path /api/hours and /api/menu already use, which route() mocks reliably.
	     The <object> fallback link below still points at the raw upstream URL with target="_blank"
	     -- that's a viewing fallback (no PDF renderer at all), not a save. -->
	<div class="fixed inset-0 z-50 flex flex-col bg-maroon-900 text-paper-50">
		<div class="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
			<div class="flex min-w-0 items-start gap-3">
				<button onclick={() => (showPdf = false)} aria-label="Back" class="shrink-0 text-2xl leading-none text-paper-50">&larr;</button>
				<div class="min-w-0">
					<p class="truncate font-display text-xl font-bold tracking-wide uppercase">{data.cafe.name}</p>
					<p class="mt-0.5 text-xs text-paper-50/55">Menu · PDF</p>
				</div>
			</div>
			<button
				onclick={() => savePdf(standingMenu.url)}
				class="shrink-0 rounded-sm border border-paper-50/30 px-3 py-1.5 text-xs font-semibold tracking-wide text-paper-50/85 hover:bg-paper-50/10"
			>
				SAVE
			</button>
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
