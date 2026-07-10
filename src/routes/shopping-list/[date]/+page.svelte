<script lang="ts">
	import type { PageProps, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { format, parseISO } from 'date-fns';
	import { ArrowLeft, MoreHorizontal, Plus, Check, Trash2, UserPlus, Loader2 } from 'lucide-svelte';
	import { swipe } from '$lib/swipe.svelte';
	import { addToast } from '$lib/toast.svelte';

	let { data, form }: PageProps = $props();

	let pendingChecks = $state<Map<string, boolean>>(new Map());
	let newItemName = $state('');
	let newItemQty = $state('');
	let deleteListOpen = $state(false);
	let manualAdd = $state(false);
	let showAddForm = $derived(!!data.list || manualAdd);
	let recipePickerOpen = $state(false);
	let assignPickerOpen = $state(false);
	let pendingRecipeId = $state('');
	let duplicateCount = $state(0);
	let duplicateTotal = $state(0);
	let duplicateMode = $state<'ask' | ''>('');

	let dateObj = $derived(parseISO(data.date));
	let humanDate = $derived(format(dateObj, 'EEEE, d MMMM'));
	let allChecked = $derived(data.items.length > 0 && data.items.every((i) => i.checked));
	let showAllDone = $state(false);
	let allDoneTimer: ReturnType<typeof setTimeout> | null = null;
	let swipeOffsets = $state<Record<string, number>>({});

	$effect(() => {
		if (allChecked) {
			showAllDone = true;
			if (allDoneTimer) clearTimeout(allDoneTimer);
			allDoneTimer = setTimeout(() => (showAllDone = false), 3000);
		} else {
			showAllDone = false;
			if (allDoneTimer) {
				clearTimeout(allDoneTimer);
				allDoneTimer = null;
			}
		}
	});

	let groups = $derived.by(() => {
		const map = new Map<string, { name: string; items: typeof data.items }>();
		for (const item of data.items) {
			const key = item.source_recipe_name || 'Other';
			if (!map.has(key)) map.set(key, { name: key, items: [] });
			map.get(key)!.items.push(item);
		}
		return [...map.values()];
	});

	let assigneeLabel = $derived(data.assignedToUser?.username ?? 'Unassigned');
</script>

<div class="min-h-screen pb-20">
	<header class="safe-top flex items-center gap-3 px-4">
		<a href="/shopping-list" class="rounded-lg p-1 active:bg-gray-100">
			<ArrowLeft class="h-6 w-6" />
		</a>
		<h1 class="flex-1 text-lg font-semibold">{humanDate}</h1>
		<button
			class="flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium active:bg-gray-200"
			onclick={() => (assignPickerOpen = true)}
		>
			<UserPlus class="h-4 w-4 text-muted" />
			{assigneeLabel}
		</button>
		<button class="rounded-lg p-1 active:bg-gray-100" onclick={() => (deleteListOpen = true)}>
			<MoreHorizontal class="h-6 w-6 text-muted" />
		</button>
	</header>

	{#if showAllDone}
		<div class="mx-4 rounded-lg bg-accent-light px-4 py-2 text-center text-sm text-primary">
			All done!
		</div>
	{/if}

	{#if !data.list || (data.items.length === 0 && !manualAdd)}
		<div class="flex flex-col items-center justify-center px-4 py-16">
			{#if !manualAdd}
				<p class="mb-6 text-muted">No shopping list for this day yet</p>
				<div class="flex gap-3">
					<button
						class="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white active:bg-primary-dark"
						onclick={() => (recipePickerOpen = true)}
					>
						Add a recipe
					</button>
					<button
						class="rounded-xl bg-white px-6 py-3 text-sm font-medium text-text shadow-sm active:bg-gray-50"
						onclick={() => (manualAdd = true)}
					>
						Add an item
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="px-4">
			{#each groups as group}
				<div class="mb-4">
					<h2 class="mb-1 text-xs font-medium uppercase text-muted">{group.name}</h2>
					<div class="rounded-xl bg-white shadow-sm">
						{#each group.items as item}
							{@const pending = pendingChecks.has(item.id)}
							{@const isChecked = pending ? pendingChecks.get(item.id)! : item.checked}
							{@const offsetX = swipeOffsets[item.id] ?? 0}
							<div
								use:swipe={{

									items: group.items,
									offsetX,
									item,
									onLeft: () => {
										const form = document.getElementById(`del-${item.id}`) as HTMLFormElement;
										form?.requestSubmit();
									},
								}}
							>
								<div
									class="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500 px-4 text-white"
									style="margin-right: -80px; width: 80px;"
								>
									<Trash2 class="h-5 w-5" />
								</div>
								<div
									class="relative flex items-center border-b border-gray-50 bg-white last:border-0"
									style="transform: translateX({offsetX}px);"
								>
									<form method="POST" action="?/checkItem" use:enhance={() => {
										const target = !item.checked;
										pendingChecks.set(item.id, target);
										pendingChecks = new Map(pendingChecks);
										return async ({ update }) => {
											try {
												await update({ invalidateAll: false });
											} finally {
												pendingChecks.delete(item.id);
												pendingChecks = new Map(pendingChecks);
											}
										};
									}} class="flex-1">
										<input type="hidden" name="itemId" value={item.id} />
										<input type="hidden" name="checked" value={String(!isChecked)} />
										<button
											type="submit"
											class={`flex w-full items-center gap-3 px-4 py-3 text-left ${
												isChecked ? 'line-through opacity-70' : ''
											}`}
											disabled={pending}
										>
											<span class="relative h-6 w-6 flex-shrink-0">
												<span
													class="absolute inset-0 flex items-center justify-center rounded border-2 transition-all duration-200 {pending
														? 'opacity-0 scale-50'
														: 'opacity-100 scale-100'} {isChecked
														? 'border-primary bg-primary text-white'
														: 'border-gray-300'}"
												>
													{#if isChecked}
														<Check class="h-4 w-4" />
													{/if}
												</span>
												<span
													class="absolute inset-0 flex items-center justify-center transition-all duration-200 {pending
														? 'opacity-100 scale-100'
														: 'opacity-0 scale-50'}"
												>
													<Loader2 class="h-5 w-5 animate-spin text-primary" />
												</span>
											</span>
											<span class="flex-1">
												{#if item.quantity && item.quantity !== '1'}
													<span class="font-medium text-accent">{item.quantity}x </span>
												{/if}
												<span class="text-text">{item.name}</span>
											</span>
										</button>
									</form>
									<form hidden method="POST" action="?/deleteItem" use:enhance id="del-{item.id}">
										<input type="hidden" name="itemId" value={item.id} />
									</form>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if showAddForm}
		<form
			method="POST"
			action="?/addItem"
			use:enhance={() => {
				newItemName = '';
				newItemQty = '';
			}}
			class="mt-3 px-4"
		>
			<div class="flex gap-2">
				<input
					id="addItemInput"
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
	{/if}
</div>

{#if data.list}
	<div class="fixed bottom-24 right-4 z-50">
		<button
			class="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg active:bg-primary-dark"
			onclick={() => (recipePickerOpen = true)}
		>
			<Plus class="h-6 w-6" />
		</button>
	</div>
{/if}

{#if recipePickerOpen}
	<button
		class="fixed inset-0 z-40 bg-black/30"
		onclick={() => (recipePickerOpen = false)}
		aria-label="Close recipe picker"
	></button>
	<div
		class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-4"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mb-4 h-1 w-12 self-center rounded-full bg-gray-300 mx-auto"></div>
		<h2 class="mb-3 text-lg font-semibold">Add Recipe</h2>
		<div class="max-h-64 overflow-y-auto">
			{#each data.recipes as recipe}
				<form
					method="POST"
					action="?/addRecipe"
					use:enhance={() => {
						recipePickerOpen = false;
					}}
				>
					<input type="hidden" name="recipeId" value={recipe.id} />
					<input type="hidden" name="mode" value="check_duplicates" />
					<button
						type="submit"
						class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left active:bg-gray-50"
					>
						<span class="font-medium">{recipe.name}</span>
						<span class="text-sm text-muted"
							>{recipe.ingredientCount}
							{recipe.ingredientCount === 1 ? 'ingredient' : 'ingredients'}</span
						>
					</button>
				</form>
			{/each}
			{#if data.recipes.length === 0}
				<p class="py-4 text-center text-muted">No recipes yet</p>
			{/if}
		</div>
	</div>
{/if}

{#if form?.pendingRecipeId}
	{@const rid = String(form?.pendingRecipeId ?? '')}
	{@const dupCount = Number(form?.duplicateCount ?? 0)}
	{@const totalCount = Number(form?.totalCount ?? 0)}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
			<p class="mb-4 text-center text-sm">
				{dupCount} of {totalCount} items from this recipe are already in the list.
			</p>
			<div class="flex flex-col gap-2">
				<form method="POST" action="?/addRecipe" use:enhance>
					<input type="hidden" name="recipeId" value={rid} />
					<input type="hidden" name="mode" value="add_all" />
					<button
						type="submit"
						class="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white"
					>
						Add anyway
					</button>
				</form>
				<form method="POST" action="?/addRecipe" use:enhance>
					<input type="hidden" name="recipeId" value={rid} />
					<input type="hidden" name="mode" value="skip_duplicates" />
					<button
						type="submit"
						class="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium"
					>
						Skip duplicates
					</button>
				</form>
				<button
					class="w-full rounded-xl py-3 text-sm text-muted"
					onclick={() => goto(`/shopping-list/${data.date}`)}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

{#if assignPickerOpen}
	<button
		class="fixed inset-0 z-40 bg-black/30"
		onclick={() => (assignPickerOpen = false)}
		aria-label="Close assign picker"
	></button>
	<div
		class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-white p-4"
		style="padding-bottom: env(safe-area-inset-bottom)"
	>
		<div class="mb-4 h-1 w-12 self-center rounded-full bg-gray-300 mx-auto"></div>
		<h2 class="mb-3 text-lg font-semibold">Assign list</h2>
		<div class="flex flex-col gap-1">
			<form
				method="POST"
				action="?/assignList"
				use:enhance={() => {
					assignPickerOpen = false;
					return async ({ result, update }) => {
						if (result.type === 'success' && result.data?.pushSent) {
							addToast('Notification sent', 'success');
						}
						await update({ invalidateAll: false });
					};
				}}
			>
				<input type="hidden" name="userId" value="" />
				<button
					type="submit"
					class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left active:bg-gray-50 {!data.assignedToUser
						? 'font-medium text-text'
						: ''}"
				>
					<UserPlus class="h-5 w-5 text-muted" />
					<span>Unassigned</span>
					{#if !data.assignedToUser}
						<Check class="ml-auto h-4 w-4 text-primary" />
					{/if}
				</button>
			</form>
			{#each data.allUsers as user}
				{@const isSelf = user.id === data.user?.id}
				<form
					method="POST"
					action="?/assignList"
					use:enhance={() => {
						assignPickerOpen = false;
						return async ({ result, update }) => {
							if (result.type === 'success' && result.data?.pushSent) {
								addToast('Notification sent', 'success');
							}
							await update({ invalidateAll: false });
						};
					}}
				>
					<input type="hidden" name="userId" value={user.id} />
					<button
						type="submit"
						class="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left active:bg-gray-50 {data
							.assignedToUser?.id === user.id
							? 'font-medium text-text'
							: ''}"
					>
						<UserPlus class="h-5 w-5 text-muted" />
						<span>{user.username}{isSelf ? ' (You)' : ''}</span>
						{#if data.assignedToUser?.id === user.id}
							<Check class="ml-auto h-4 w-4 text-primary" />
						{/if}
					</button>
				</form>
			{/each}
		</div>
	</div>
{/if}

{#if deleteListOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
		<div class="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
			<p class="mb-4 text-center">Delete this shopping list?</p>
			<div class="flex flex-col gap-2">
				<form
					method="POST"
					action="?/deleteList"
					use:enhance={() => {
						deleteListOpen = false;
					}}
				>
					<button
						type="submit"
						class="w-full rounded-xl bg-red-500 py-3 text-sm font-medium text-white"
					>
						Delete
					</button>
				</form>
				<button
					class="w-full rounded-xl border border-gray-200 py-3 text-sm"
					onclick={() => (deleteListOpen = false)}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
