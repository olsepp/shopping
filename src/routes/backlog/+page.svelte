<script lang="ts">
	import type { PageProps } from './$types';
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Plus, ArrowRight, Trash2 } from 'lucide-svelte';
	import { swipe } from '$lib/swipe.svelte';

	let { data, form }: PageProps = $props();

	let newItemName = $state('');
	let newItemQty = $state('');

	let swipeOffsets = $state<Record<string, number>>({});

	let seenItemIds = $state<Set<string>>(new Set());
	let newItemIds = $state<Set<string>>(new Set());
	let firstLoad = $state(true);

	$effect(() => {
		const currentIds = new Set(data.items.map((i: { id: string }) => i.id));
		if (firstLoad) {
			seenItemIds = new Set(currentIds);
			firstLoad = false;
			return;
		}
		const fresh = [...currentIds].filter((id) => !seenItemIds.has(id));
		if (fresh.length) {
			const nextNew = new Set(newItemIds);
			const nextSeen = new Set(seenItemIds);
			for (const id of fresh) {
				nextNew.add(id);
				nextSeen.add(id);
			}
			newItemIds = nextNew;
			seenItemIds = nextSeen;
		}
	});

	let showAddedModal = $state(false);
	let addedTimer: ReturnType<typeof setTimeout> | null = null;
	let duplicateModal = $state<{ itemId: string; name: string } | null>(null);

	type AddResult = { added?: true; alreadyAdded?: true; error?: string };

	function getSwipeOffset(itemId: string) {
		return swipeOffsets[itemId] ?? 0;
	}

	function showAdded() {
		showAddedModal = true;
		if (addedTimer) clearTimeout(addedTimer);
		addedTimer = setTimeout(() => (showAddedModal = false), 1800);
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
						class="relative flex items-center gap-3 px-4 py-3 bg-white {newItemIds.has(item.id)
							? 'animate-new-item'
							: ''}"
						style="transform: translateX({offsetX}px);"
						onanimationend={() => {
							if (newItemIds.has(item.id)) {
								const next = new Set(newItemIds);
								next.delete(item.id);
								newItemIds = next;
							}
						}}
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
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'success') {
									const res = (result.data ?? {}) as AddResult;
									if (res.alreadyAdded) {
										duplicateModal = { itemId: item.id, name: item.name };
									} else if (res.added) {
										showAdded();
									}
								}
								await update({ reset: false, invalidateAll: false });
							};
						}}
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

{#if showAddedModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
		<div class="flex flex-col items-center gap-3 rounded-2xl bg-white px-10 py-8 shadow-lg">
			<svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
				<circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none" />
				<path class="checkmark-check" fill="none" d="M14 27l5.917 4.917L37 16" />
			</svg>
			<p class="text-sm font-medium text-text">Added to today's list</p>
		</div>
	</div>
{/if}

{#if duplicateModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
			<p class="mb-1 text-center text-base font-semibold text-text">Already in today's list</p>
			<p class="mb-5 text-center text-sm text-muted">
				"{duplicateModal.name}" is already on today's shopping list. Add another one?
			</p>
			<div class="flex flex-col gap-2">
				<form
					method="POST"
					action="?/addToShoppingList"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								const res = (result.data ?? {}) as AddResult;
								if (res.added) {
									duplicateModal = null;
									showAdded();
								}
							}
							await update({ reset: false, invalidateAll: false });
						};
					}}
				>
					<input type="hidden" name="itemId" value={duplicateModal.itemId} />
					<input type="hidden" name="forceAdd" value="true" />
					<button
						type="submit"
						class="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white"
					>
						Add anyway
					</button>
				</form>
				<button
					type="button"
					onclick={() => (duplicateModal = null)}
					class="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.checkmark {
		width: 56px;
		height: 56px;
	}
	.checkmark-circle {
		stroke: #22c55e;
		stroke-width: 2;
		stroke-dasharray: 166;
		stroke-dashoffset: 166;
		animation: checkmark-stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
	}
	.checkmark-check {
		stroke: #22c55e;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 48;
		stroke-dashoffset: 48;
		animation: checkmark-stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.5s forwards;
	}
	@keyframes checkmark-stroke {
		to {
			stroke-dashoffset: 0;
		}
	}

	.animate-new-item {
		animation: new-item-flash 1.5s ease-out;
	}
	@keyframes new-item-flash {
		0% {
			background-color: rgba(197, 88, 228, 0.28);
		}
		60% {
			background-color: rgba(197, 88, 228, 0.18);
		}
		100% {
			background-color: #ffffff;
		}
	}
</style>
