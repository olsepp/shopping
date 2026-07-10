import type { LayoutServerLoad } from './$types';
import { getVapidPublicKey } from '$lib/server/push';

export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user, vapidPublicKey: getVapidPublicKey() };
};
