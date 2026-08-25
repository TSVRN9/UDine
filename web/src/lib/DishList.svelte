<script lang="ts">
	import {
		favoriteKey,
		mealPeriodLabel,
		menuItemMatchesPreferences,
		type FoodPreferences,
		type MealPeriod,
		type MenuItem,
	} from "@udine/shared";

	// #178: extracted verbatim out of halls/[slug]/+page.svelte (same markup, same classes, same
	// role="list"/role="listitem" structure the halls-menu.spec.ts / rank-surfaces.spec.ts e2e specs
	// already assert on) so /cafes/[tid] can render dish cards identically instead of forking a
	// second copy of ~80 lines of favorite/servings/log markup. Only real addition: the price chip
	// on the meta line (item.price, #176) -- absent for halls, so halls render exactly as before.
	// `periods` is a prop (not the module-level MEAL_PERIODS constant) because a café's items can
	// carry retail-only periods ("allday"/"grabngo", #175) that MEAL_PERIODS deliberately excludes
	// from hall tabs -- the café page passes its own, dynamically-derived period list.
	let {
		items,
		periods,
		prefs,
		favoriteDishKeys,
		servings,
		onToggleFavorite,
		onLog,
	}: {
		items: MenuItem[];
		periods: MealPeriod[];
		prefs: FoodPreferences;
		favoriteDishKeys: Set<string>;
		servings: Record<string, number>;
		onToggleFavorite: (dishName: string) => void;
		onLog: (item: MenuItem) => void;
	} = $props();

	function itemsFor(period: MealPeriod): MenuItem[] {
		return items.filter((i) => i.mealPeriod === period && menuItemMatchesPreferences(i, prefs));
	}

	// Preserves the order categories arrive in from the feed — that's the order the dining hall
	// itself lists them, which is more useful than alphabetical.
	function categoriesIn(periodItems: MenuItem[]): string[] {
		return [...new Set(periodItems.map((i) => i.category))];
	}
</script>

{#each periods as period (period)}
	{@const periodItems = itemsFor(period)}
	{#if periodItems.length > 0}
		<section class="mt-8">
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="section-title">{mealPeriodLabel(period)}</h2>
				<span class="font-mono text-xs text-ink-900/50">
					{periodItems.length}
					{periodItems.length === 1 ? "dish" : "dishes"}
				</span>
			</div>
			<div class="label-rule mt-1 text-ink-900/25"></div>

			{#each categoriesIn(periodItems) as category (category)}
				<h3 class="mt-5 font-body text-xs font-semibold tracking-[0.15em] text-ink-900/55 uppercase">
					{category}
				</h3>
				<ul class="mt-2 flex flex-col gap-2">
					{#each periodItems.filter((i) => i.category === category) as item (item.dishName + item.category)}
						{@const isFavorite = favoriteDishKeys.has(favoriteKey({ type: 'dish', dishName: item.dishName }))}
						<li class="card flex flex-wrap items-start gap-x-3 gap-y-3 px-4 py-3">
							<!-- Glyph-only by contract: the favorites e2e spec reads this button's text to
							     detect state, so no icon swap and no hidden label inside it. -->
							<button
								onclick={() => onToggleFavorite(item.dishName)}
								aria-label="favorite"
								aria-pressed={isFavorite}
								title={isFavorite ? `Remove ${item.dishName} from favorites` : `Add ${item.dishName} to favorites`}
								class="shrink-0 rounded-sm px-1 text-xl leading-none transition-colors {isFavorite
									? 'text-gold-500'
									: 'text-ink-900/25 hover:text-gold-500'}"
							>
								{isFavorite ? '★' : '☆'}
							</button>

							<div class="min-w-0 flex-1 basis-64">
								<p class="font-display text-lg leading-tight font-semibold text-maroon-900">{item.dishName}</p>
								<p class="mt-0.5 font-mono text-sm text-ink-900/75">
									<!-- #176/#178: retail-only. Leads the meta line per the café styling spec (mono,
									     weight 600, maroon-600 -- #7c2430). Absent for halls, so this renders exactly
									     as today there. -->
									{#if item.price}
										<span class="font-semibold text-maroon-600">{item.price}</span>
										<span class="text-ink-900/35">·</span>
									{/if}
									{item.nutrition.calories} cal
									<span class="text-ink-900/35">·</span>
									{item.nutrition.proteinG}g protein
									<span class="text-ink-900/35">·</span>
									{item.nutrition.totalCarbG}g carbs
									<span class="text-ink-900/35">·</span>
									{item.nutrition.totalFatG}g fat
								</p>
								<p class="mt-0.5 text-xs text-ink-900/50">per {item.nutrition.servingSize}</p>
								{#if item.dietTags.length > 0}
									<p class="mt-1.5 flex flex-wrap gap-1">
										{#each item.dietTags as tag (tag)}
											<span class="badge bg-maroon-600/10 text-maroon-600">{tag}</span>
										{/each}
									</p>
								{/if}
								{#if item.allergens.length > 0}
									<p class="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-ink-900/50">
										Contains
										{#each item.allergens as allergen (allergen)}
											<span class="badge">{allergen}</span>
										{/each}
									</p>
								{/if}
							</div>

							<div class="flex shrink-0 items-end gap-2">
								<label class="block">
									<span class="field-label mb-1">Servings</span>
									<input
										type="number"
										min="0.25"
										step="0.25"
										bind:value={servings[item.dishName]}
										class="input w-20 text-right font-mono"
									/>
								</label>
								<button onclick={() => onLog(item)} class="btn btn-primary">Log</button>
							</div>
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{/if}
{/each}
