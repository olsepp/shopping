import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { hashPassword, createSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { count, eq } from 'drizzle-orm';

const MAX_USERS = 2;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/shopping-list');

	const [result] = await db.select({ value: count() }).from(users);
	if (Number(result.value) >= MAX_USERS) throw redirect(302, '/login');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = data.get('username')?.toString().trim() || '';
		const password = data.get('password')?.toString() || '';

		if (!username || !password) {
			return { error: 'Username and password are required' };
		}
		if (password.length < 6) {
			return { error: 'Password must be at least 6 characters' };
		}

		const [result] = await db.select({ value: count() }).from(users);
		if (Number(result.value) >= MAX_USERS) {
			return { error: 'Registration is closed' };
		}

		const [existing] = await db
			.select()
			.from(users)
			.where(eq(users.username, username))
			.limit(1);
		if (existing) {
			return { error: 'Username already taken' };
		}

		const password_hash = await hashPassword(password);
		const [user] = await db
			.insert(users)
			.values({ username, password_hash })
			.returning();

		const token = await createSessionToken({ userId: user.id, username: user.username });
		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30,
			secure: process.env.NODE_ENV === 'production'
		});

		throw redirect(302, '/shopping-list');
	}
};
