import { db } from '$lib/server/db';
import { recipes, ingredients } from '$lib/server/db/schema';
import { eq, sql, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const all = await db
		.select({
			id: recipes.id,
			name: recipes.name,
			description: recipes.description,
			updated_at: recipes.updated_at,
			ingredientCount: sql<number>`count(${ingredients.id})`.mapWith(Number)
		})
		.from(recipes)
		.leftJoin(ingredients, eq(ingredients.recipe_id, recipes.id))
		.groupBy(recipes.id)
		.orderBy(desc(recipes.updated_at));

	return { recipes: all };
};
