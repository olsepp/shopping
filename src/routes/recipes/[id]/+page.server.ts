import { db } from '$lib/server/db';
import { recipes, ingredients } from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { broadcast } from '$lib/server/sse';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [recipe] = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			description: recipes.description,
			updated_at: recipes.updated_at
		})
		.from(recipes)
		.where(eq(recipes.id, params.id))
		.limit(1);

	if (!recipe) return { notFound: true as const, recipe: null, ingredients: [] };

	const ings = await db
		.select()
		.from(ingredients)
		.where(eq(ingredients.recipe_id, params.id))
		.orderBy(asc(ingredients.position));

	return { recipe, ingredients: ings, notFound: false as const };
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() || '';
		const description = data.get('description')?.toString().trim() || undefined;
		const ingNames = data.getAll('ingredient_name[]');
		const ingQtys = data.getAll('ingredient_quantity[]');

		if (!name) return { error: 'Recipe name is required' };

		const validIngredients = ingNames
			.map((n, i) => ({
				name: (n as string).trim(),
				quantity: (ingQtys[i] as string)?.trim() || '1'
			}))
			.filter((ing) => ing.name);

		if (validIngredients.length === 0) {
			return { error: 'At least one ingredient is required' };
		}

		await db
			.update(recipes)
			.set({ name, description, updated_at: new Date() })
			.where(eq(recipes.id, params.id));

		await db.delete(ingredients).where(eq(ingredients.recipe_id, params.id));

		await db.insert(ingredients).values(
			validIngredients.map((ing, i) => ({
				recipe_id: params.id,
				name: ing.name,
				quantity: ing.quantity,
				position: i
			}))
		);

		broadcast({ type: 'recipe_updated', recipeId: params.id });
		return { success: true };
	},

	delete: async ({ params }) => {
		await db.delete(recipes).where(eq(recipes.id, params.id));
		broadcast({ type: 'recipe_deleted', recipeId: params.id });
		return { deleted: true };
	}
};
