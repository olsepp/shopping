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
	if (!pushSupported() || !vapidPublicKey) return false;

	let registration: ServiceWorkerRegistration;

	if (!navigator.serviceWorker.controller) {
		try {
			registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
		} catch {
			return false;
		}
	} else {
		try {
			registration = await Promise.race([
				navigator.serviceWorker.getRegistration(),
				new Promise<ServiceWorkerRegistration>((_, reject) =>
					setTimeout(() => reject(new Error('timeout')), 5000)
				)
			]);
			if (!registration) throw new Error('no registration');
		} catch {
			return false;
		}
	}

	let subscription: PushSubscription | null;
	try {
		subscription = await registration.pushManager.getSubscription();
	} catch {
		return false;
	}

	if (subscription) {
		subscribed = true;
		try {
			await sendToServer(subscription);
		} catch {
			return false;
		}
		return true;
	}

	try {
		subscription = await Promise.race([
			registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlB64ToUint8Array(vapidPublicKey)
			}),
			new Promise<PushSubscription>((_, reject) =>
				setTimeout(() => reject(new Error('timeout')), 15000)
			)
		]);
	} catch {
		return false;
	}

	try {
		await sendToServer(subscription);
	} catch {
		return false;
	}

	subscribed = true;
	return true;
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
