import { db } from '$lib/server/db';
import { pending_items, shopping_lists, shopping_items } from '$lib/server/db/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import { broadcast } from '$lib/server/sse';
import { today } from '$lib/server/date';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ depends }) => {
	depends('backlog');

	const items = await db.select().from(pending_items).orderBy(desc(pending_items.created_at));

	return { items };
};

async function getOrCreateList() {
	const [existing] = await db
		.select()
		.from(shopping_lists)
		.where(eq(shopping_lists.date, today()))
		.limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(shopping_lists)
		.values({ date: today() })
		.onConflictDoNothing()
		.returning();

	if (created) return created;

	const [retried] = await db
		.select()
		.from(shopping_lists)
		.where(eq(shopping_lists.date, today()))
		.limit(1);
	return retried;
}

export const actions: Actions = {
	addToShoppingList: async ({ request, locals }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';
		const forceAdd = data.get('forceAdd')?.toString() === 'true';

		const [item] = await db
			.select()
			.from(pending_items)
			.where(eq(pending_items.id, itemId))
			.limit(1);

		if (!item) return { error: 'Item not found' };

		const list = await getOrCreateList();

		const [existing] = await db
			.select({ id: shopping_items.id, quantity: shopping_items.quantity })
			.from(shopping_items)
			.where(and(eq(shopping_items.list_id, list.id), eq(shopping_items.name, item.name)))
			.limit(1);

		if (existing && !forceAdd) return { alreadyAdded: true };

		if (existing && forceAdd) {
			const currentQty = parseInt(existing.quantity ?? '', 10);
			const newQty = (Number.isNaN(currentQty) ? 1 : currentQty) + 1;
			await db
				.update(shopping_items)
				.set({ quantity: String(newQty) })
				.where(eq(shopping_items.id, existing.id));
			broadcast({ type: 'shopping_list_updated', date: today() });
			return { added: true };
		}

		const [maxPos] = await db
			.select({ max: sql<number>`coalesce(max(${shopping_items.position}), -1)`.mapWith(Number) })
			.from(shopping_items)
			.where(eq(shopping_items.list_id, list.id));

		await db.insert(shopping_items).values({
			list_id: list.id,
			name: item.name,
			quantity: item.quantity,
			position: (maxPos?.max ?? -1) + 1
		});

		broadcast({ type: 'shopping_list_updated', date: today() });

		return { added: true };
	},

	deleteItem: async ({ request }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';

		await db.delete(pending_items).where(eq(pending_items.id, itemId));

		broadcast({ type: 'pending_item_deleted', itemId });
	},

	addItem: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() || '';
		const quantity = data.get('quantity')?.toString().trim() || '1';

		if (!name) return { error: 'Item name is required' };

		await db.insert(pending_items).values({
			name,
			quantity,
			created_by: locals.user!.id
		});

		broadcast({ type: 'pending_item_added' });
	}
};
