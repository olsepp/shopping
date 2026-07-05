import { db } from '$lib/server/db';
import { recipes, ingredients } from '$lib/server/db/schema';
import { broadcast } from '$lib/server/sse';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() || '';
		const description = data.get('description')?.toString().trim() || undefined;

		const ingNames = data.getAll('ingredient_name[]');
		const ingQtys = data.getAll('ingredient_quantity[]');

		if (!name) return { error: 'Recipe name is required' };

		const validIngredients = ingNames
			.map((n, i) => ({
				name: n.toString().trim(),
				quantity: ingQtys[i]?.toString().trim() || undefined
			}))
			.filter((ing) => ing.name);

		if (validIngredients.length === 0) {
			return { error: 'At least one ingredient is required' };
		}

		const [recipe] = await db
			.insert(recipes)
			.values({
				name,
				description,
				created_by: locals.user!.id
			})
			.returning();

		await db.insert(ingredients).values(
			validIngredients.map((ing, i) => ({
				recipe_id: recipe.id,
				name: ing.name,
				quantity: ing.quantity || '1',
				position: i
			}))
		);

		broadcast({ type: 'recipe_updated', recipeId: recipe.id });

		return { success: true, recipeId: recipe.id };
	}
};
