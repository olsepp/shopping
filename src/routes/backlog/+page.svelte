<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { Plus, ArrowRight, Trash2 } from 'lucide-svelte';
	import { swipe } from '$lib/swipe.svelte';

	let { data, form }: PageProps = $props();

	let newItemName = $state('');
	let newItemQty = $state('');

	let swipeOffsets = $state<Record<string, number>>({});

	function getSwipeOffset(itemId: string) {
		return swipeOffsets[itemId] ?? 0;
	}

	function swipedRight(itemId: string) {
		const form = document.getElementById(`form-swipe-${itemId}`) as HTMLFormElement;
		form?.requestSubmit();
	}

	function swipedLeft(itemId: string) {
		const form = document.getElementById(`form-delete-${itemId}`) as HTMLFormElement;
		form?.requestSubmit();
	}
</script>

<div class="pb-20">
	<header class="safe-top px-4">
		<h1 class="text-xl font-semibold">Backlog</h1>
	</header>

	<section class="mt-4 px-4">
		{#if data.items.length === 0}
			<div class="flex flex-col items-center justify-center py-16">
				<p class="text-muted">No items in backlog</p>
				<p class="mt-1 text-xs text-muted">Add items below that you plan to buy</p>
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each data.items as item (item.id)}
					{@const offsetX = getSwipeOffset(item.id)}
					<div
						use:swipe={{
							onSwipeRight: () => swipedRight(item.id),
							onSwipeLeft: () => swipedLeft(item.id),
							onStateChange: (ox) => {
								swipeOffsets = { ...swipeOffsets, [item.id]: ox };
							}
						}}
						class="relative overflow-hidden rounded-xl bg-white shadow-sm"
					>
						<div
							class="absolute inset-y-0 left-0 flex items-center justify-center rounded-l-xl bg-accent text-white"
							style="width: {Math.max(0, offsetX)}px; opacity: {Math.min(
								1,
								Math.max(0, offsetX / 80)
							)};"
						>
							<ArrowRight class="h-5 w-5" />
						</div>
						<div
							class="absolute inset-y-0 right-0 flex items-center justify-center rounded-r-xl bg-red-500 text-white"
							style="width: {Math.max(0, -offsetX)}px; opacity: {Math.min(
								1,
								Math.max(0, -offsetX / 80)
							)};"
						>
							<Trash2 class="h-5 w-5" />
						</div>
						<div
							class="relative flex items-center gap-3 px-4 py-3 bg-white"
							style="transform: translateX({offsetX}px);"
						>
							<span class="flex-1 text-text">{item.name}</span>
							{#if item.quantity && item.quantity !== '1'}
								<span class="text-sm font-medium text-accent">{item.quantity}x</span>
							{/if}
						</div>

						<form
							hidden
							id="form-swipe-{item.id}"
							method="POST"
							action="?/addToShoppingList"
							use:enhance
						>
							<input type="hidden" name="itemId" value={item.id} />
						</form>
						<form hidden id="form-delete-{item.id}" method="POST" action="?/deleteItem" use:enhance>
							<input type="hidden" name="itemId" value={item.id} />
						</form>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="mt-6 px-4">
		<form
			method="POST"
			action="?/addItem"
			use:enhance={() => {
				newItemName = '';
				newItemQty = '';
			}}
		>
			<div class="flex gap-2">
				<input
					name="name"
					type="text"
					required
					bind:value={newItemName}
					inputmode="text"
					placeholder="Add item..."
					class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base placeholder-muted focus:border-primary focus:outline-none"
				/>
				<input
					name="quantity"
					type="text"
					bind:value={newItemQty}
					inputmode="text"
					placeholder="Qty"
					class="w-20 rounded-lg border border-gray-200 px-3 py-2 text-base placeholder-muted focus:border-primary focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-lg bg-primary px-4 py-2 text-white active:bg-primary-dark"
				>
					<Plus class="h-5 w-5" />
				</button>
			</div>
		</form>
	</section>
</div>
