<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-svelte';
	import type { ActionData } from './$types';

	let { form } = $props();

	let name = $state('');
	let description = $state('');
	let ingredientRows = $state([{ name: '', quantity: '1' }]);

	function addRow() {
		ingredientRows = [...ingredientRows, { name: '', quantity: '1' }];
	}

	function removeRow(i: number) {
		if (ingredientRows.length === 1) return;
		ingredientRows = ingredientRows.filter((_, idx) => idx !== i);
	}

	function moveRow(from: number, to: number) {
		if (to < 0 || to >= ingredientRows.length) return;
		const rows = [...ingredientRows];
		[rows[from], rows[to]] = [rows[to], rows[from]];
		ingredientRows = rows;
	}

	$effect(() => {
		if (form?.success) {
			goto(`/recipes/${form.recipeId}`);
		}
	});
</script>

<div class="pb-20">
	<header class="safe-top flex items-center gap-3 px-4">
		<a href="/recipes" class="rounded-lg p-1 active:bg-gray-100">
			<ArrowLeft class="h-6 w-6" />
		</a>
		<h1 class="text-lg font-semibold">New Recipe</h1>
	</header>

	<form method="POST" use:enhance class="px-4">
		{#if form?.error}
			<p class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{form.error}</p>
		{/if}

		<label class="mb-1 block text-sm font-medium" for="name">Name</label>
		<input
			id="name"
			name="name"
			type="text"
			required
			bind:value={name}
			inputmode="text"
			class="mb-4 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
			placeholder="Recipe name"
		/>

		<label class="mb-1 block text-sm font-medium" for="desc">Description (optional)</label>
		<textarea
			id="desc"
			name="description"
			bind:value={description}
			rows={2}
			class="mb-4 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
			placeholder="Short description"></textarea>

		<h2 class="mb-2 text-sm font-medium">Ingredients</h2>
		<div class="flex flex-col gap-2">
			{#each ingredientRows as row, i}
				<div class="flex items-center gap-2">
					<div class="flex flex-col">
						<button
							type="button"
							class="rounded p-0.5 active:bg-gray-100"
							onclick={() => moveRow(i, i - 1)}
							disabled={i === 0}
						>
							<ChevronUp class="h-4 w-4 text-muted" />
						</button>
						<button
							type="button"
							class="rounded p-0.5 active:bg-gray-100"
							onclick={() => moveRow(i, i + 1)}
							disabled={i === ingredientRows.length - 1}
						>
							<ChevronDown class="h-4 w-4 text-muted" />
						</button>
					</div>
					<input
						name="ingredient_name[]"
						type="text"
						required
						bind:value={row.name}
						inputmode="text"
						placeholder="Ingredient"
						class="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
					/>
					<input
						name="ingredient_quantity[]"
						type="text"
						bind:value={row.quantity}
						inputmode="text"
						placeholder="Qty"
						class="w-24 rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
					/>
					<button
						type="button"
						class="rounded-lg p-1 text-muted active:text-red-500"
						onclick={() => removeRow(i)}
					>
						<Trash2 class="h-5 w-5" />
					</button>
				</div>
			{/each}
		</div>

		<button
			type="button"
			class="mt-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-muted active:bg-gray-50"
			onclick={addRow}
		>
			<Plus class="inline h-4 w-4" /> Add ingredient
		</button>

		<button
			type="submit"
			class="mt-6 w-full rounded-xl bg-primary py-3 text-base font-medium text-white active:bg-primary-dark"
		>
			Save recipe
		</button>
	</form>
</div>
