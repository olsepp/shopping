import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';

const PUBLIC_ROUTES = ['/login', '/register'];

export const handle: Handle = async ({ event, resolve }) => {
	const isPublic = PUBLIC_ROUTES.includes(event.url.pathname);

	const cookie = event.cookies.get('session');
	if (cookie) {
		const payload = await verifySessionToken(cookie);
		if (payload) {
			event.locals.user = { id: payload.userId, username: payload.username };
		}
	}

	if (!event.locals.user && !isPublic) {
		throw redirect(302, '/login');
	}

	return resolve(event);
};
