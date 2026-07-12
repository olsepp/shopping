import { db } from '$lib/server/db';
import { shopping_lists, shopping_items, recipes, ingredients, users } from '$lib/server/db/schema';
import { eq, and, asc, sql } from 'drizzle-orm';
import { broadcast } from '$lib/server/sse';
import { sendPushToUser } from '$lib/server/push';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, depends }) => {
	depends('shopping-list');
	const date = params.date;

	const [list] = await db
		.select()
		.from(shopping_lists)
		.where(eq(shopping_lists.date, date))
		.limit(1);

	let items: (typeof shopping_items.$inferSelect)[] = [];
	if (list) {
		items = await db
			.select()
			.from(shopping_items)
			.where(eq(shopping_items.list_id, list.id))
			.orderBy(asc(shopping_items.position));
	}

	const allRecipes = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			ingredientCount: sql<number>`count(${ingredients.id})`.mapWith(Number)
		})
		.from(recipes)
		.leftJoin(ingredients, eq(ingredients.recipe_id, recipes.id))
		.groupBy(recipes.id)
		.orderBy(asc(recipes.name));

	const allUsers = await db
		.select({ id: users.id, username: users.username })
		.from(users)
		.orderBy(asc(users.username));

	let assignedToUser: { id: number; username: string } | null = null;
	if (list?.assigned_to) {
		const [assigned] = await db
			.select({ id: users.id, username: users.username })
			.from(users)
			.where(eq(users.id, list.assigned_to))
			.limit(1);
		assignedToUser = assigned ?? null;
	}

	return {
		list,
		items,
		recipes: allRecipes,
		date,
		allUsers,
		assignedToUser
	};
};

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

export const actions: Actions = {
	checkItem: async ({ request, params }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';
		const checked = data.get('checked') === 'true';

		await db.update(shopping_items).set({ checked }).where(eq(shopping_items.id, itemId));

		broadcast({ type: 'item_checked', listDate: params.date, itemId, checked });
		return { checked };
	},

	addItem: async ({ request, params }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() || '';
		const quantity = data.get('quantity')?.toString().trim() || '1';

		if (!name) return { error: 'Item name is required' };

		const list = await getOrCreateList(params.date);

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

		broadcast({ type: 'shopping_list_updated', date: params.date });
	},

	deleteItem: async ({ request, params }) => {
		const data = await request.formData();
		const itemId = data.get('itemId')?.toString() || '';
		await db.delete(shopping_items).where(eq(shopping_items.id, itemId));
		broadcast({ type: 'shopping_list_updated', date: params.date });
	},

	addRecipe: async ({ request, params }) => {
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

		const list = await getOrCreateList(params.date);

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

		broadcast({ type: 'shopping_list_updated', date: params.date });
	},

	assignList: async ({ request, params, locals }) => {
		const data = await request.formData();
		const userIdRaw = data.get('userId')?.toString();
		const assignedTo = userIdRaw ? parseInt(userIdRaw, 10) : null;

		const list = await getOrCreateList(params.date);

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
			date: params.date,
			assignedTo,
			assignedToUsername,
			assignedBy: locals.user!.username
		});

		let pushSent = false;
		if (assignedTo && assignedTo !== locals.user!.id) {
			pushSent = await sendPushToUser(assignedTo, {
				title: 'Shopping List Assigned',
				body: `${locals.user!.username} assigned a list to you`,
				url: `/shopping-list/${params.date}`
			});
		}
		return { pushSent };
	},

	deleteList: async ({ params }) => {
		await db.delete(shopping_lists).where(eq(shopping_lists.date, params.date));
		broadcast({ type: 'shopping_list_updated', date: params.date });
	}
};
