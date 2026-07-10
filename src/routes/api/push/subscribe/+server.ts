import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { and, eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { endpoint, keys } = (await request.json()) as {
		endpoint: string;
		keys: { p256dh: string; auth: string };
	};

	if (!endpoint || !keys?.p256dh || !keys?.auth) {
		return json({ error: 'Invalid subscription' }, { status: 400 });
	}

	const existing = await db
		.select()
		.from(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.user_id, locals.user.id),
				eq(pushSubscriptions.endpoint, endpoint)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(pushSubscriptions)
			.set({ p256dh: keys.p256dh, auth: keys.auth })
			.where(eq(pushSubscriptions.id, existing[0].id));
		console.log('[push] Updated existing subscription for user', locals.user.id);
	} else {
		await db.insert(pushSubscriptions).values({
			user_id: locals.user.id,
			endpoint,
			p256dh: keys.p256dh,
			auth: keys.auth
		});
		console.log('[push] Saved new subscription for user', locals.user.id);
	}

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { endpoint } = await request.json();

	await db
		.delete(pushSubscriptions)
		.where(
			and(
				eq(pushSubscriptions.user_id, locals.user.id),
				eq(pushSubscriptions.endpoint, endpoint)
			)
		);

	return json({ ok: true });
};
