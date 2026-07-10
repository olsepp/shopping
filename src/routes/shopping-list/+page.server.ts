import { db } from '$lib/server/db';
import { shopping_lists, shopping_items, recipes, ingredients, users } from '$lib/server/db/schema';
import { eq, asc, sql } from 'drizzle-orm';
import { broadcast } from '$lib/server/sse';
import { sendPushToUser } from '$lib/server/push';
import { today } from '$lib/server/date';
import type { PageServerLoad, Actions } from './$types';

async function getOrCreateList(date: string) {
	const [existing] = await db
		.select()
		.from(shopping_lists)
		.where(eq(shopping_lists.date, date))
		.limit(1);
	if (existing) return existing;

	const [created] = await db
		.insert(shopping_lists)
		.values({ date })
		.onConflictDoNothing()
		.returning();

	if (created) return created;

	const [retried] = await db
		.select()
		.from(shopping_lists)
		.where(eq(shopping_lists.date, date))
		.limit(1);
	return retried;
}

export const load: PageServerLoad = async ({ depends }) => {
	depends('shopping-list');

	const [todayList, allRecipes, allUsers, lists] = await Promise.all([
		db
			.select()
			.from(shopping_lists)
			.where(eq(shopping_lists.date, today()))
			.limit(1)
			.then((r) => r[0] ?? null),
		db
			.select({
				id: recipes.id,
				name: recipes.name,
				ingredientCount: sql<number>`count(${ingredients.id})`.mapWith(Number)
			})
			.from(recipes)
			.leftJoin(ingredients, eq(ingredients.recipe_id, recipes.id))
			.groupBy(recipes.id)
			.orderBy(asc(recipes.name)),
		db.select({ id: users.id, username: users.username }).from(users).orderBy(asc(users.username)),
		db
			.select({
				id: shopping_lists.id,
				date: shopping_lists.date,
				assigned_to: shopping_lists.assigned_to,
				assigned_username: users.username,
				total: sql<number>`count(${shopping_items.id})`.mapWith(Number),
				checked:
					sql<number>`count(${shopping_items.id}) filter (where ${shopping_items.checked})`.mapWith(
						Number
					)
			})
			.from(shopping_lists)
			.leftJoin(shopping_items, eq(shopping_items.list_id, shopping_lists.id))
			.leftJoin(users, eq(shopping_lists.assigned_to, users.id))
			.groupBy(shopping_lists.id, shopping_lists.date, shopping_lists.assigned_to, users.username)
			.orderBy(shopping_lists.date)
	]);

	const [todayItems, assignedToUser] = await Promise.all([
		todayList
			? db
					.select()
					.from(shopping_items)
					.where(eq(shopping_items.list_id, todayList.id))
					.orderBy(asc(shopping_items.position))
			: Promise.resolve([] as (typeof shopping_items.$inferSelect)[]),
		todayList?.assigned_to
			? db
					.select({ id: users.id, username: users.username })
					.from(users)
					.where(eq(users.id, todayList.assigned_to))
					.limit(1)
					.then((r) => r[0] ?? null)
			: Promise.resolve(null as { id: number; username: string } | null)
	]);

	return {
		todayList,
		todayItems,
		assignedToUser,
		allRecipes,
		allUsers,
		today: today(),
		lists: lists.map((l) => {
			const dateStr = l.date as unknown as string;
			let status: 'empty' | 'partial' | 'complete' = 'empty';
			if (l.total > 0 && l.checked < l.total) status = 'partial';
			else if (l.total > 0 && l.checked === l.total) status = 'complete';

			return {
				date: dateStr,
				status,
				total: l.total,
				checked: l.checked,
				assigned_username: l.assigned_username
			};
		})
	};
};

export const actions: Actions = {
	checkItem: async ({ request }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';
		const checked = data.get('checked') === 'true';

		await db.update(shopping_items).set({ checked }).where(eq(shopping_items.id, itemId));

		broadcast({ type: 'item_checked', listDate: today(), itemId, checked });
	},

	addItem: async ({ request }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() || '';
		const quantity = data.get('quantity')?.toString().trim() || '1';

		if (!name) return { error: 'Item name is required' };

		const list = await getOrCreateList(today());

		const [maxPos] = await db
			.select({ max: sql<number>`coalesce(max(${shopping_items.position}), -1)`.mapWith(Number) })
			.from(shopping_items)
			.where(eq(shopping_items.list_id, list.id));

		await db.insert(shopping_items).values({
			list_id: list.id,
			name,
			quantity,
			position: (maxPos?.max ?? -1) + 1
		});

		broadcast({ type: 'shopping_list_updated', date: today() });
	},

	deleteItem: async ({ request }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';
		await db.delete(shopping_items).where(eq(shopping_items.id, itemId));
		broadcast({ type: 'shopping_list_updated', date: today() });
	},

	addRecipe: async ({ request }) => {
		const data = await request.formData();
		const recipeId = data.get('recipeId')?.toString() || '';
		const mode = data.get('mode')?.toString() || 'add_all';

		if (!recipeId) return { error: 'Recipe ID is required' };

		const recipeIngredients = await db
			.select()
			.from(ingredients)
			.where(eq(ingredients.recipe_id, recipeId))
			.orderBy(asc(ingredients.position));

		if (recipeIngredients.length === 0) {
			return { error: 'This recipe has no ingredients' };
		}

		const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
		if (!recipe) return { error: 'Recipe not found' };

		const list = await getOrCreateList(today());

		const existingItems = await db
			.select({ name: shopping_items.name })
			.from(shopping_items)
			.where(eq(shopping_items.list_id, list.id));

		const existingNames = new Set(existingItems.map((i) => i.name.toLowerCase()));

		let toInsert = recipeIngredients;

		if (mode === 'skip_duplicates') {
			toInsert = recipeIngredients.filter((ing) => !existingNames.has(ing.name.toLowerCase()));
		}

		if (mode === 'check_duplicates') {
			const duplicates = recipeIngredients.filter((ing) =>
				existingNames.has(ing.name.toLowerCase())
			);
			if (duplicates.length > 0) {
				return {
					pendingRecipeId: recipeId,
					duplicateCount: duplicates.length,
					totalCount: recipeIngredients.length
				};
			}
		}

		if (toInsert.length === 0) {
			return { error: 'All items are already in the list' };
		}

		const [maxPos] = await db
			.select({ max: sql<number>`coalesce(max(${shopping_items.position}), -1)`.mapWith(Number) })
			.from(shopping_items)
			.where(eq(shopping_items.list_id, list.id));

		let pos = (maxPos?.max ?? -1) + 1;
		await db.insert(shopping_items).values(
			toInsert.map((ing) => ({
				list_id: list.id,
				name: ing.name,
				quantity: ing.quantity,
				source_recipe_id: recipeId,
				source_recipe_name: recipe.name,
				position: pos++
			}))
		);

		broadcast({ type: 'shopping_list_updated', date: today() });
	},

	assignList: async ({ request, locals }) => {
		const data = await request.formData();
		const userIdRaw = data.get('userId')?.toString();
		const assignedTo = userIdRaw ? parseInt(userIdRaw, 10) : null;

		const list = await getOrCreateList(today());

		await db
			.update(shopping_lists)
			.set({ assigned_to: assignedTo })
			.where(eq(shopping_lists.id, list.id));

		let assignedToUsername: string | null = null;
		if (assignedTo !== null) {
			const [user] = await db
				.select({ username: users.username })
				.from(users)
				.where(eq(users.id, assignedTo))
				.limit(1);
			assignedToUsername = user?.username ?? null;
		}

		broadcast({
			type: 'list_assigned',
			date: today(),
			assignedTo,
			assignedToUsername,
			assignedBy: locals.user!.username
		});

		let pushSent = false;
		if (assignedTo && assignedTo !== locals.user!.id) {
			pushSent = await sendPushToUser(assignedTo, {
				title: 'Shopping List Assigned',
				body: `${locals.user!.username} assigned a list to you`,
				url: `/shopping-list`
			});
		}
		return { pushSent };
	},

	deleteList: async () => {
		await db.delete(shopping_lists).where(eq(shopping_lists.date, today()));
		broadcast({ type: 'shopping_list_updated', date: today() });
	}
};
