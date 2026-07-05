import {
	pgTable,
	uuid,
	serial,
	text,
	integer,
	boolean,
	timestamp,
	date,
	unique
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	username: text('username').notNull().unique(),
	password_hash: text('password_hash').notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const recipes = pgTable('recipes', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	description: text('description'),
	created_by: integer('created_by').references(() => users.id),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const ingredients = pgTable('ingredients', {
	id: uuid('id').primaryKey().defaultRandom(),
	recipe_id: uuid('recipe_id')
		.notNull()
		.references(() => recipes.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	quantity: text('quantity'),
	position: integer('position').notNull().default(0)
});

export const shopping_lists = pgTable(
	'shopping_lists',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		date: date('date').notNull(),
		note: text('note'),
		assigned_to: integer('assigned_to').references(() => users.id),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
	},
	(t) => [unique().on(t.date)]
);

export const pending_items = pgTable('pending_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull(),
	quantity: text('quantity'),
	created_by: integer('created_by')
		.notNull()
		.references(() => users.id),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow()
});

export const shopping_items = pgTable('shopping_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	list_id: uuid('list_id')
		.notNull()
		.references(() => shopping_lists.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	quantity: text('quantity'),
	checked: boolean('checked').notNull().default(false),
	source_recipe_id: uuid('source_recipe_id').references(() => recipes.id, {
		onDelete: 'set null'
	}),
	source_recipe_name: text('source_recipe_name'),
	position: integer('position').notNull().default(0)
});
