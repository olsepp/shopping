import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

let _db: PostgresJsDatabase<typeof schema> | null = null;

function getDb() {
	if (_db) return _db;
	if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
	const client = postgres(env.DATABASE_URL);
	_db = drizzle(client, { schema });
	return _db;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
	get(_target, prop) {
		const target = getDb() as unknown as Record<string | symbol, unknown>;
		return target[prop as string | symbol];
	}
});
