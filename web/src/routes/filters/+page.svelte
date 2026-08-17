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

<a href="/">&larr; Dining Halls</a>
<h1>Dietary Filters</h1>
<p>Applied to menus on the dining hall pages. Stored on this device only.</p>

{#if saved}<p role="status">Saved</p>{/if}

<h2>Avoid allergens</h2>
{#if data.allergenOptions.length === 0}
	<p>No allergen data found on today's menus.</p>
{/if}
<ul>
	{#each data.allergenOptions as allergen (allergen)}
		<li>
			<label>
				<input type="checkbox" checked={prefs.allergensToAvoid.includes(allergen)} onchange={() => toggleAllergen(allergen)} />
				{allergen}
			</label>
		</li>
	{/each}
</ul>

<h2>Require diet tags</h2>
{#if data.dietTagOptions.length === 0}
	<p>No diet-tag data found on today's menus.</p>
{/if}
<ul>
	{#each data.dietTagOptions as tag (tag)}
		<li>
			<label>
				<input type="checkbox" checked={prefs.requiredDietTags.includes(tag)} onchange={() => toggleDietTag(tag)} />
				{tag}
			</label>
		</li>
	{/each}
</ul>

<button onclick={save}>Save</button>
