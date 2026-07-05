import { redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyPassword, createSessionToken } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) throw redirect(302, '/shopping-list');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const username = data.get('username')?.toString().trim() || '';
		const password = data.get('password')?.toString() || '';

		if (!username || !password) {
			return { error: 'Username and password are required' };
		}

		const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);

		if (!user || !(await verifyPassword(password, user.password_hash))) {
			return { error: 'Invalid username or password' };
		}

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
