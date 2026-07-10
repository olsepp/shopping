<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		format,
		parseISO,
		startOfWeek,
		addDays,
		isToday,
		startOfMonth,
		getDaysInMonth
	} from 'date-fns';
	import {
		ChevronLeft,
		ChevronRight,
		ArrowLeft,
		MoreHorizontal,
		Plus,
		Check,
		Trash2,
		UserPlus,
		Loader2
	} from 'lucide-svelte';
	import { swipe } from '$lib/swipe.svelte';
	import { addToast } from '$lib/toast.svelte';

	let { data, form }: PageProps = $props();

	// ---- today widget state ----
	let newItemName = $state('');
	let pendingChecks = $state<Set<string>>(new Set());
	let newItemQty = $state('');
	let deleteListOpen = $state(false);
	let manualAdd = $state(false);
	let showAddForm = $derived(!!data.todayList || manualAdd);
	let recipePickerOpen = $state(false);
	let assignPickerOpen = $state(false);
	let pendingRecipeId = $state('');
	let duplicateCount = $state(0);
	let duplicateTotal = $state(0);
	let duplicateMode = $state<'ask' | ''>('');

	let todayDate = $derived(parseISO(data.today));
	let humanDate = $derived(format(todayDate, 'EEEE, d MMMM'));
	let allChecked = $derived(
		data.todayItems.length > 0 && data.todayItems.every((i: { checked: boolean }) => i.checked)
	);
	let showAllDone = $state(false);
	let allDoneTimer: ReturnType<typeof setTimeout> | null = null;
	let swipeOffsets = $state<Record<string, number>>({});
	let seenItemIds = $state<Set<string>>(new Set());
	let newItemIds = $state<Set<string>>(new Set());
	let firstLoad = $state(true);

	$effect(() => {
		const currentIds = new Set(data.todayItems.map((i: { id: string }) => i.id));
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

	let todayGroups = $derived.by(() => {
		const map = new Map<string, { name: string; items: typeof data.todayItems }>();
		for (const item of data.todayItems) {
			const key = item.source_recipe_name || 'Other';
			if (!map.has(key)) map.set(key, { name: key, items: [] });
			map.get(key)!.items.push(item);
		}
		return [...map.values()];
	});

	let assigneeLabel = $derived(data.assignedToUser?.username ?? 'Unassigned');

	// ---- calendar state ----
	let viewMonth = $state<{ year: number; month: number } | null>(null);
	let pickerOpen = $state(false);
	let pickerYear = $state(new Date().getFullYear());

	let isTodayMode = $derived(viewMonth === null);

	let currentDate = $derived(viewMonth ? new Date(viewMonth.year, viewMonth.month) : new Date());

	let listsByDate = $derived(
		new Map(
			data.lists.map(
				(l: {
					date: string;
					status: string;
					total: number;
					checked: number;
					assigned_username: string | null;
				}) => [l.date, l]
			)
		)
	);

	function getDays(start: Date, count: number) {
		const days = [];
		for (let i = 0; i < count; i++) days.push(addDays(start, i));
		return days;
	}

	let weekStart = $derived(
		isTodayMode
			? startOfWeek(new Date(), { weekStartsOn: 1 })
			: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
	);
	let weekDays = $derived(getDays(weekStart, 7));

	let upcomingDays = $derived(
		(isTodayMode
			? getDays(new Date(), 30)
			: getDays(startOfMonth(currentDate), getDaysInMonth(currentDate))
		).map((d) => {
			const key = format(d, 'yyyy-MM-dd');
			const list = listsByDate.get(key);
			return { date: d, key, list };
		})
	);

	function statusDot(status: string | undefined) {
		if (!status || status === 'empty') return 'bg-gray-300';
		if (status === 'partial') return 'bg-yellow-400';
		return 'bg-green-400';
	}

	let allMonths = $derived(
		Array.from({ length: 12 }, (_, i) => {
			return { label: format(new Date(pickerYear, i), 'MMM'), month: i };
		})
	);
</script>

<div class="pb-20">
	<!-- ===== Today's list widget ===== -->
	<header class="safe-top flex items-center gap-3 px-4">
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

	{#if !data.todayList || (data.todayItems.length === 0 && !manualAdd)}
		<div class="flex flex-col items-center justify-center px-4 py-8">
			{#if !manualAdd}
				<p class="mb-6 text-muted">No shopping list for today yet</p>
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
			{#each todayGroups as group}
				<div class="mb-4">
					<h2 class="mb-1 text-xs font-medium uppercase text-muted">{group.name}</h2>
					<div class="rounded-xl bg-white shadow-sm">
						{#each group.items as item}
						{@const pending = pendingChecks.has(item.id)}
						{@const isChecked = item.checked !== pending}
						{@const offsetX = swipeOffsets[item.id] ?? 0}
							<div
								use:swipe={{
									onSwipeLeft: () => {
										const form = document.getElementById(`del-${item.id}`) as HTMLFormElement;
										form?.requestSubmit();
									},
									onStateChange: (ox) => {
										swipeOffsets = { ...swipeOffsets, [item.id]: ox };
									}
								}}
								class="relative overflow-hidden"
							>
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
								class="relative flex items-center border-b border-gray-50 bg-white last:border-0 {newItemIds.has(
									item.id
								)
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
									<form
										method="POST"
										action="?/checkItem"
										use:enhance={() => {
											pendingChecks.add(item.id);
											pendingChecks = new Set(pendingChecks);
											return async ({ update }) => {
												pendingChecks.delete(item.id);
												pendingChecks = new Set(pendingChecks);
												await update({ invalidateAll: false });
											};
										}}
										class="flex-1"
									>
										<input type="hidden" name="itemId" value={item.id} />
										<input type="hidden" name="checked" value={String(!isChecked)} />
										<button
											type="submit"
											class={`flex w-full items-center gap-3 px-4 py-3 text-left ${
												isChecked ? 'line-through opacity-70' : ''
											}`}
											disabled={pending}
										>
											<span
												class={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border-2 ${
													isChecked || pending ? 'border-primary bg-primary text-white' : 'border-gray-300'
												}`}
											>
												{#if pending}
													<Loader2 class="h-4 w-4 animate-spin" />
												{:else if isChecked}
													<Check class="h-4 w-4" />
												{/if}
											</span>
											<span class="flex-1">
												{#if item.quantity && item.quantity !== '1'}
													<span class="font-medium text-accent">{item.quantity}x </span>
												{/if}
												<span class="text-text">{item.name}</span>
											</span>
										</button>
									</form>
									<form
										hidden
										method="POST"
										action="?/deleteItem"
										use:enhance={() =>
											async ({ update }) =>
												update({ invalidateAll: false })}
										id="del-{item.id}"
									>
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
				return async ({ update }) => update({ invalidateAll: false });
			}}
			class="mt-3 px-4"
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
	{/if}

	<!-- ===== Calendar ===== -->
	<hr class="mx-4 mt-6 border-gray-200" />

	<header class="flex items-center justify-between px-4 pt-4">
		<h1 class="text-xl font-semibold">Lists</h1>
		<button
			class="rounded-lg bg-white px-3 py-1.5 text-sm shadow-sm"
			onclick={() => (pickerOpen = !pickerOpen)}
		>
			{isTodayMode ? 'Upcoming' : format(currentDate, 'MMMM yyyy')}
		</button>
	</header>

	{#if pickerOpen}
		<button
			class="fixed inset-0 z-30 bg-black/20"
			onclick={() => (pickerOpen = false)}
			aria-label="Close picker"
		></button>
		<div class="fixed left-4 right-4 top-16 z-40 rounded-xl bg-white p-4 shadow-lg">
			<div class="mb-3 flex items-center justify-between">
				<button class="rounded-lg p-1 active:bg-gray-100" onclick={() => (pickerYear -= 1)}>
					<ChevronLeft class="h-5 w-5" />
				</button>
				<span class="font-medium">{pickerYear}</span>
				<button class="rounded-lg p-1 active:bg-gray-100" onclick={() => (pickerYear += 1)}>
					<ChevronRight class="h-5 w-5" />
				</button>
			</div>
			<div class="grid grid-cols-4 gap-2">
				{#each allMonths as m}
					<button
						class="rounded-lg px-2 py-1.5 text-sm {viewMonth?.month === m.month &&
						viewMonth?.year === pickerYear
							? 'bg-primary text-white'
							: 'active:bg-gray-100'}"
						onclick={() => {
							viewMonth = { year: pickerYear, month: m.month };
							pickerOpen = false;
						}}
					>
						{m.label}
					</button>
				{/each}
			</div>
			<button
				class="mt-3 w-full rounded-lg py-1.5 text-sm text-primary active:bg-gray-100"
				onclick={() => {
					viewMonth = null;
					pickerOpen = false;
				}}
			>
				Upcoming
			</button>
		</div>
	{/if}

	<section class="mt-3 overflow-x-auto px-4">
		<div class="flex gap-2 pb-2">
			{#each weekDays as day}
				{@const key = format(day, 'yyyy-MM-dd')}
				{@const list = listsByDate.get(key)}
				<a
					href="/shopping-list/{key}"
					class="flex min-w-[48px] flex-col items-center rounded-xl px-3 py-2 text-center {isToday(
						day
					)
						? 'bg-primary text-white'
						: 'bg-white shadow-sm'}"
				>
					<span class="text-[10px] uppercase">{format(day, 'EEE')}</span>
					<span class="text-lg font-semibold leading-tight">{format(day, 'd')}</span>
					<span class={`mt-0.5 h-1.5 w-1.5 rounded-full ${statusDot(list?.status)}`}></span>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-4 px-4">
		<h2 class="mb-2 text-sm font-medium text-muted">
			{isTodayMode ? 'Upcoming' : format(currentDate, 'MMMM yyyy')}
		</h2>
		<div class="flex flex-col gap-2">
			{#each upcomingDays as { date: dayDate, key, list }}
				<a
					href="/shopping-list/{key}"
					class="flex items-center rounded-xl bg-white p-4 shadow-sm active:bg-gray-50"
				>
					<div class="mr-4 text-center min-w-[40px]">
						<div class="text-2xl font-semibold leading-none">{format(dayDate, 'd')}</div>
						<div class="text-xs text-muted">{format(dayDate, 'EEE')}</div>
					</div>
					<div class="flex-1">
						{#if list?.assigned_username}
							<span
								class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs {list.assigned_username ===
								data.user?.username
									? 'bg-primary-light font-medium text-primary'
									: 'bg-gray-100 text-muted'}">{list.assigned_username}</span
							>
						{/if}
						{#if !list || list.status === 'empty'}
							<span class="text-sm text-muted">No list</span>
						{:else if list.status === 'partial'}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-accent"
							>
								{list.checked}/{list.total}
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-primary"
							>
								All done
							</span>
						{/if}
					</div>
				</a>
			{/each}
		</div>
	</section>
</div>

<!-- ===== Modals for today widget ===== -->

{#if data.todayList}
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
			{#each data.allRecipes as recipe}
				<form
					method="POST"
					action="?/addRecipe"
					use:enhance={() => {
						recipePickerOpen = false;
						return async ({ update }) => update({ invalidateAll: false });
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
			{#if data.allRecipes.length === 0}
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
				<form
					method="POST"
					action="?/addRecipe"
					use:enhance={() =>
						async ({ update }) =>
							update({ invalidateAll: false })}
				>
					<input type="hidden" name="recipeId" value={rid} />
					<input type="hidden" name="mode" value="add_all" />
					<button
						type="submit"
						class="w-full rounded-xl bg-primary py-3 text-sm font-medium text-white"
					>
						Add anyway
					</button>
				</form>
				<form
					method="POST"
					action="?/addRecipe"
					use:enhance={() =>
						async ({ update }) =>
							update({ invalidateAll: false })}
				>
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
					onclick={() => goto(`/shopping-list`)}
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
						return async ({ update }) => update({ invalidateAll: false });
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

<style>
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
