self.addEventListener('push', (event) => {
	if (!event.data) return;

	let payload;
	try {
		payload = event.data.json();
	} catch {
		return;
	}

	const promise = self.registration.showNotification(payload.title, {
		body: payload.body,
		icon: '/icons/icon.svg',
		data: { url: payload.url },
		tag: 'shopping-list-assign',
		renotify: true
	});

	event.waitUntil(promise);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url || '/shopping-list';

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then(function (clients) {
				for (var i = 0; i < clients.length; i++) {
					var client = clients[i];
					var clientUrl = new URL(client.url);
					if (clientUrl.pathname === url && 'focus' in client) {
						return client.focus();
					}
				}
				return self.clients.openWindow(url);
			})
	);
});
