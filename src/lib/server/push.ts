import webpush from 'web-push';
import { db } from '$lib/server/db';
import { pushSubscriptions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const vapidSubject = process.env.VAPID_SUBJECT;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
	webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export function getVapidPublicKey(): string {
	return vapidPublicKey ?? '';
}

export async function sendPushToUser(
	userId: number,
	payload: { title: string; body: string; url: string }
): Promise<void> {
	if (!vapidPublicKey || !vapidPrivateKey) return;

	const subs = await db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.user_id, userId));

	await Promise.allSettled(
		subs.map(async (sub) => {
			try {
				await webpush.sendNotification(
					{
						endpoint: sub.endpoint,
						keys: { p256dh: sub.p256dh, auth: sub.auth }
					},
					JSON.stringify(payload)
				);
			} catch (err: any) {
				if (err.statusCode === 410 || err.statusCode === 404) {
					await db
						.delete(pushSubscriptions)
						.where(eq(pushSubscriptions.id, sub.id));
				}
			}
		})
	);
}
