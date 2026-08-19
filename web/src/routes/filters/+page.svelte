<script lang="ts">
	import { onMount } from "svelte";
	import type { FoodPreferences } from "@udine/shared";
	import { loadPreferences, savePreferences } from "$lib/preferences";
	import type { PageProps } from "./$types";

	let { data }: PageProps = $props();

	let prefs: FoodPreferences = $state({ allergensToAvoid: [], requiredDietTags: [] });
	let saved = $state(false);

	onMount(() => {
		prefs = loadPreferences();
	});

	function toggle(list: string[], value: string): string[] {
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	function toggleAllergen(a: string) {
		prefs = { ...prefs, allergensToAvoid: toggle(prefs.allergensToAvoid, a) };
	}

	function toggleDietTag(d: string) {
		prefs = { ...prefs, requiredDietTags: toggle(prefs.requiredDietTags, d) };
	}

	function save() {
		savePreferences(prefs);
		saved = true;
		setTimeout(() => (saved = false), 1500);
	}
</script>

<header>
	<h1 class="page-title">Dietary Filters</h1>
	<div class="label-rule mt-2 text-gold-500"></div>
	<p class="mt-3 max-w-prose text-ink-900/70">
		Applied to menus on the dining hall pages. Stored on this device only.
	</p>
</header>

{#if saved}
	<p role="status" class="badge mt-4">Saved</p>
{/if}

<section class="mt-8">
	<h2 class="section-title">Avoid allergens</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if data.allergenOptions.length === 0}
		<div class="empty-state mt-4">
			<p>No allergen data found on today's menus.</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-wrap gap-2">
			{#each data.allergenOptions as allergen (allergen)}
				{@const checked = prefs.allergensToAvoid.includes(allergen)}
				<li>
					<!-- Native checkbox stays in the accessible-name tree so `getByRole("checkbox", { name })`
					     keeps working unchanged; the label around it carries the on/off visual state. -->
					<label
						class="flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-semibold transition-colors {checked
							? 'border-maroon-600 bg-maroon-600 text-paper-50'
							: 'border-ink-900/25 text-ink-900/70 hover:border-maroon-600/50'}"
					>
						<input type="checkbox" checked={checked} onchange={() => toggleAllergen(allergen)} class="accent-maroon-600" />
						{allergen}
					</label>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section class="mt-8">
	<h2 class="section-title">Require diet tags</h2>
	<div class="label-rule mt-1 text-ink-900/25"></div>

	{#if data.dietTagOptions.length === 0}
		<div class="empty-state mt-4">
			<p>No diet-tag data found on today's menus.</p>
		</div>
	{:else}
		<ul class="mt-4 flex flex-wrap gap-2">
			{#each data.dietTagOptions as tag (tag)}
				{@const checked = prefs.requiredDietTags.includes(tag)}
				<li>
					<label
						class="flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-1.5 text-sm font-semibold transition-colors {checked
							? 'border-maroon-600 bg-maroon-600 text-paper-50'
							: 'border-ink-900/25 text-ink-900/70 hover:border-maroon-600/50'}"
					>
						<input type="checkbox" checked={checked} onchange={() => toggleDietTag(tag)} class="accent-maroon-600" />
						{tag}
					</label>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<button onclick={save} class="btn btn-primary mt-8">Save</button>
