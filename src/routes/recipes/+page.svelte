<script lang="ts">
	import type { PageProps } from './$types';
	import { Plus } from 'lucide-svelte';

	let { data }: PageProps = $props();
</script>

<div class="pb-20">
	<header class="safe-top px-4">
		<h1 class="text-xl font-semibold">Recipes</h1>
	</header>

	{#if data.recipes.length === 0}
		<div class="flex flex-col items-center justify-center px-4 py-16">
			<p class="mb-4 text-muted">No recipes yet</p>
			<a
				href="/recipes/new"
				class="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white active:bg-primary-dark"
			>
				Add your first one
			</a>
		</div>
	{:else}
		<div class="mt-3 flex flex-col gap-2 px-4">
			{#each data.recipes as recipe}
				<a
					href="/recipes/{recipe.id}"
					class="block rounded-xl bg-white p-4 shadow-sm active:bg-gray-50"
				>
					<h2 class="font-semibold">{recipe.name}</h2>
					<p class="mt-0.5 text-sm text-muted">
						{recipe.ingredientCount}
						{recipe.ingredientCount === 1 ? 'ingredient' : 'ingredients'}
					</p>
				</a>
			{/each}
		</div>
	{/if}

	<a
		href="/recipes/new"
		class="fixed bottom-20 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg active:bg-primary-dark"
		style="bottom: calc(5rem + env(safe-area-inset-bottom))"
	>
		<Plus class="h-6 w-6" />
	</a>
</div>
