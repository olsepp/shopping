import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { hash } from 'bcryptjs';
import { users } from '../src/lib/server/db/schema';

const DATABASE_URL =
	process.env.DATABASE_URL || 'postgres://root:mysecretpassword@localhost:5432/local';

async function seed() {
	const client = postgres(DATABASE_URL);
	const db = drizzle(client);

	const password = await hash('Melody21', 10);

	await db
		.insert(users)
		.values([
			{ username: 'Oliver', password_hash: password },
			{ username: 'Kristin', password_hash: password }
		])
		.onConflictDoNothing();

	await client.end();
}

seed().catch(console.error);
