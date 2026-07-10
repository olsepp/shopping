import { addToast } from '$lib/toast.svelte';

let vapidPublicKey = $state<string>('');
let permission = $state<NotificationPermission>('default');
let subscribed = $state(false);

export function getPushState() {
	return {
		get vapidPublicKey() {
			return vapidPublicKey;
		},
		get permission() {
			return permission;
		},
		get subscribed() {
			return subscribed;
		},
		setVapidKey(key: string) {
			vapidPublicKey = key;
		}
	};
}

export function pushSupported(): boolean {
	return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function checkPermission(): Promise<NotificationPermission> {
	if (!pushSupported()) {
		permission = 'denied';
		return 'denied';
	}
	permission = Notification.permission;
	return permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
	if (!pushSupported()) return 'denied';

	permission = await Notification.requestPermission();
	if (permission === 'granted') {
		await subscribe();
	}
	return permission;
}

export async function subscribe(): Promise<boolean> {
	if (!pushSupported()) {
		console.error('[push] Push API not supported');
		return false;
	}
	if (!vapidPublicKey) {
		console.error('[push] VAPID public key is empty');
		return false;
	}

	try {
		console.log('[push] Getting SW registration...');
		let registration = await navigator.serviceWorker.getRegistration();
		if (!registration) {
			console.log('[push] No registration yet, waiting for ready...');
			registration = await Promise.race([
				navigator.serviceWorker.ready,
				new Promise<ServiceWorkerRegistration>((_, reject) =>
					setTimeout(() => reject(new Error('SW ready timed out')), 15000)
				)
			]);
		}
		console.log('[push] SW ready, checking existing subscription...');
		let subscription = await Promise.race([
			registration.pushManager.getSubscription(),
			new Promise<PushSubscription | null>((_, reject) =>
				setTimeout(() => reject(new Error('getSubscription timed out')), 10000)
			)
		]);

		if (subscription) {
			console.log('[push] Existing subscription found, sending to server...');
			subscribed = true;
			await sendToServer(subscription);
			console.log('[push] Existing subscription sent to server');
			return true;
		}

		console.log('[push] No existing subscription, creating new one...');
		subscription = await Promise.race([
			registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlB64ToUint8Array(vapidPublicKey)
			}),
			new Promise<PushSubscription>((_, reject) =>
				setTimeout(() => reject(new Error('pushManager.subscribe timed out')), 15000)
			)
		]);
		console.log('[push] New subscription created:', subscription.endpoint);

		await sendToServer(subscription);
		console.log('[push] Subscription sent to server');
		subscribed = true;
		addToast('Notifications enabled, you will be notified when a list is assigned to you', 'success');
		return true;
	} catch (err) {
		console.error('[push] Subscription failed:', err);
		addToast('Failed to enable notifications, please try again', 'error');
		return false;
	}
}

export async function unsubscribe(): Promise<void> {
	if (!pushSupported()) return;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return;

	await subscription.unsubscribe();

	try {
		await fetch('/api/push/subscribe', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
	} catch {
		// best effort
	}

	subscribed = false;
}

async function sendToServer(subscription: PushSubscription): Promise<void> {
	const json = subscription.toJSON();
	if (!json.keys) return;

	await fetch('/api/push/subscribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			endpoint: json.endpoint,
			keys: {
				p256dh: json.keys.p256dh,
				auth: json.keys.auth
			}
		})
	});
}

function urlB64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
