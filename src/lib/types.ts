export type SSEEvent =
	| { type: 'shopping_list_updated'; date: string }
	| { type: 'recipe_updated'; recipeId: string }
	| { type: 'recipe_deleted'; recipeId: string }
	| { type: 'item_checked'; listDate: string; itemId: string; checked: boolean }
	| {
			type: 'list_assigned';
			date: string;
			assignedTo: number | null;
			assignedToUsername: string | null;
			assignedBy: string;
	  }
	| { type: 'pending_item_added' }
	| { type: 'pending_item_deleted'; itemId: string };
