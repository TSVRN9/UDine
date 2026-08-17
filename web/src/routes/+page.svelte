<script lang="ts">
	import { DINING_HALLS } from "@udine/shared";
</script>

<h1>UDine</h1>
<p><a href="/today">Today's macros</a></p>

<h2>Dining Halls</h2>
<ul>
	{#each DINING_HALLS as hall (hall.tid)}
		<li><a href="/halls/{hall.slug}">{hall.name}</a></li>
	{/each}
</ul>
