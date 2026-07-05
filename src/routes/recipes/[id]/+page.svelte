<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowLeft,
		MoreHorizontal,
		Plus,
		Trash2,
		ChevronUp,
		ChevronDown,
		Pencil
	} from 'lucide-svelte';

	let { data, form }: PageProps = $props();

	let editing = $state(false);
	let menuOpen = $state(false);
	let deleteOpen = $state(false);

	let editName = $state('');
	let editDesc = $state('');
	let editRows = $state<{ name: string; quantity: string }[]>([]);

	function addRow() {
		editRows = [...editRows, { name: '', quantity: '1' }];
	}

	function removeRow(i: number) {
		if (editRows.length === 1) return;
		editRows = editRows.filter((_, idx) => idx !== i);
	}

	function moveRow(from: number, to: number) {
		if (to < 0 || to >= editRows.length) return;
		const rows = [...editRows];
		[rows[from], rows[to]] = [rows[to], rows[from]];
		editRows = rows;
	}

	function startEdit() {
		editName = data.recipe?.name ?? '';
		editDesc = data.recipe?.description ?? '';
		editRows = data.ingredients.map((ing) => ({ name: ing.name, quantity: ing.quantity ?? '' }));
		editing = true;
	}

	$effect(() => {
		if (form?.success) editing = false;
		if (form?.deleted) goto('/recipes');
	});

	let recipe = $derived(data.recipe);
</script>

{#if data.notFound}
	<div class="flex flex-col items-center justify-center px-4 py-16">
		<p class="text-muted">Recipe not found</p>
		<a href="/recipes" class="mt-4 text-primary">Back to recipes</a>
	</div>
{:else if recipe}
	<div class="pb-20">
		<header class="safe-top flex items-center gap-3 px-4">
			<a href="/recipes" class="rounded-lg p-1 active:bg-gray-100">
				<ArrowLeft class="h-6 w-6" />
			</a>
			<h1 class="flex-1 text-lg font-semibold">{recipe.name}</h1>
			{#if !editing}
				<div class="relative">
					<button class="rounded-lg p-1 active:bg-gray-100" onclick={() => (menuOpen = !menuOpen)}>
						<MoreHorizontal class="h-6 w-6 text-muted" />
					</button>
					{#if menuOpen}
						<button
							class="fixed inset-0 z-10"
							onclick={() => (menuOpen = false)}
							aria-label="Close menu"
						></button>
						<div class="absolute right-0 top-9 z-20 w-36 rounded-xl bg-white py-1 shadow-lg">
							<button
								class="w-full px-4 py-2 text-left text-sm active:bg-gray-50"
								onclick={() => {
									menuOpen = false;
									startEdit();
								}}
							>
								Edit
							</button>
							<button
								class="w-full px-4 py-2 text-left text-sm text-red-500 active:bg-gray-50"
								onclick={() => {
									menuOpen = false;
									deleteOpen = true;
								}}
							>
								Delete
							</button>
						</div>
					{/if}
				</div>
			{/if}
		</header>

		{#if editing}
			<form method="POST" action="?/update" use:enhance class="px-4">
				{#if form?.error}
					<p class="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{form.error}</p>
				{/if}

				<label class="mb-1 block text-sm font-medium" for="name">Name</label>
				<input
					id="name"
					name="name"
					type="text"
					required
					bind:value={editName}
					inputmode="text"
					class="mb-4 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
				/>

				<label class="mb-1 block text-sm font-medium" for="desc">Description</label>
				<textarea
					id="desc"
					name="description"
					bind:value={editDesc}
					rows={2}
					class="mb-4 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none"
				></textarea>

				<h2 class="mb-2 text-sm font-medium">Ingredients</h2>
				<div class="flex flex-col gap-2">
					{#each editRows as row, i}
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
									disabled={i === editRows.length - 1}
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

				<div class="mt-6 flex gap-3">
					<button
						type="button"
						class="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-medium active:bg-gray-50"
						onclick={() => (editing = false)}
					>
						Cancel
					</button>
					<button
						type="submit"
						class="flex-1 rounded-xl bg-primary py-3 text-sm font-medium text-white active:bg-primary-dark"
					>
						Save
					</button>
				</div>
			</form>
		{:else}
			<div class="px-4">
				{#if recipe.description}
					<p class="mb-4 text-sm text-muted">{recipe.description}</p>
				{/if}

				<div class="rounded-xl bg-white shadow-sm">
					{#each data.ingredients as ing}
						<div class="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
							<span class="flex-1 text-text">{ing.name}</span>
							{#if ing.quantity && ing.quantity !== '1'}
								<span class="text-sm text-muted">{ing.quantity}</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if deleteOpen}
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
				<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
					<p class="mb-4 text-center">
						Delete {recipe.name}? Items already added to shopping lists will not be removed.
					</p>
					<div class="flex flex-col gap-2">
						<form method="POST" action="?/delete" use:enhance>
							<button
								type="submit"
								class="w-full rounded-xl bg-red-500 py-3 text-sm font-medium text-white"
							>
								Delete
							</button>
						</form>
						<button
							class="w-full rounded-xl border border-gray-200 py-3 text-sm"
							onclick={() => (deleteOpen = false)}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}
