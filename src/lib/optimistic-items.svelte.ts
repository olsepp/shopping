import type { SubmitFunction } from '@sveltejs/kit';
import { addToast } from '$lib/toast.svelte';

export interface RecipeOption {
	id: string;
	name: string;
	ingredients: { id: string; name: string; quantity: string | null }[];
}

export type AddRecipeMode = 'check_duplicates' | 'add_all' | 'skip_duplicates';

export interface ShoppingItem {
	id: string;
	list_id: string;
	name: string;
	quantity: string | null;
	checked: boolean;
	source_recipe_id: string | null;
	source_recipe_name: string | null;
	position: number;
}

// crypto.randomUUID is only available in secure contexts, which excludes
// testing the dev server from a phone over plain http on the LAN.
export function createId(): string {
	if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
	const b = crypto.getRandomValues(new Uint8Array(16));
	b[6] = (b[6] & 0x0f) | 0x40;
	b[8] = (b[8] & 0x3f) | 0x80;
	const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Items added on the client before the server has confirmed them. The id is
 * generated here and sent with the form, so the server row has the same id and
 * the optimistic entry can be dropped as soon as the reloaded page data contains it.
 */
export class OptimisticItems {
	#entries = $state<(ShoppingItem & { pending: boolean })[]>([]);
	#serverItems: () => ShoppingItem[];

	constructor(serverItems: () => ShoppingItem[]) {
		this.#serverItems = serverItems;

		$effect(() => {
			const ids = new Set(this.#serverItems().map((i) => i.id));
			if (this.#entries.some((e) => ids.has(e.id))) {
				this.#entries = this.#entries.filter((e) => !ids.has(e.id));
			}
		});
	}

	/** Server items followed by optimistic ones not yet present in the server data. */
	all = $derived.by((): ShoppingItem[] => {
		const server = this.#serverItems();
		const ids = new Set(server.map((i) => i.id));
		return [...server, ...this.#entries.filter((e) => !ids.has(e.id))];
	});

	add(fields: {
		name: string;
		quantity: string | null;
		source_recipe_id?: string;
		source_recipe_name?: string;
	}): string {
		const id = createId();
		this.#entries.push({
			id,
			list_id: '',
			name: fields.name,
			quantity: fields.quantity || '1',
			checked: false,
			source_recipe_id: fields.source_recipe_id ?? null,
			source_recipe_name: fields.source_recipe_name ?? null,
			position: Math.max(-1, ...this.all.map((i) => i.position)) + 1,
			pending: true
		});
		return id;
	}

	/**
	 * `use:enhance` handler for the addRecipe action. Mirrors the server's duplicate
	 * check: when the server would ask about duplicates, nothing is added up front and
	 * the server's prompt takes over. Item ids are sent as `itemIds` (ingredient id ->
	 * item id) so the server rows match the optimistic ones.
	 */
	addRecipe(recipe: RecipeOption | undefined, mode: AddRecipeMode): SubmitFunction {
		return ({ formData }) => {
			const ids: Record<string, string> = {};
			if (recipe) {
				const existing = new Set(this.all.map((i) => i.name.toLowerCase()));
				const isDuplicate = (ing: { name: string }) => existing.has(ing.name.toLowerCase());
				let toAdd = recipe.ingredients;
				if (mode === 'skip_duplicates') toAdd = toAdd.filter((ing) => !isDuplicate(ing));
				if (mode === 'check_duplicates' && toAdd.some(isDuplicate)) toAdd = [];
				for (const ing of toAdd) {
					ids[ing.id] = this.add({
						name: ing.name,
						quantity: ing.quantity,
						source_recipe_id: recipe.id,
						source_recipe_name: recipe.name
					});
				}
			}
			formData.set('itemIds', JSON.stringify(ids));

			return async ({ result, update }) => {
				const added = Object.values(ids);
				const data = result.type === 'success' ? result.data : undefined;
				if (result.type === 'success' && !data?.error && !data?.pendingRecipeId) {
					added.forEach((id) => this.confirm(id));
				} else {
					added.forEach((id) => this.remove(id));
					if (result.type !== 'success' || data?.error) {
						addToast(String(data?.error || 'Could not add recipe'), 'error');
					}
				}
				await update({ invalidateAll: false });
			};
		};
	}

	/** The server accepted the item; it can be checked/deleted before the reload arrives. */
	confirm(id: string) {
		const entry = this.#entries.find((e) => e.id === id);
		if (entry) entry.pending = false;
	}

	remove(id: string) {
		this.#entries = this.#entries.filter((e) => e.id !== id);
	}

	isPending(id: string): boolean {
		return this.#entries.some((e) => e.id === id && e.pending);
	}
}
