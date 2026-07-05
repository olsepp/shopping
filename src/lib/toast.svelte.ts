type ToastItem = {
	id: number;
	message: string;
	type: 'error' | 'success';
};

let counter = 0;
export const toasts = $state<ToastItem[]>([]);

export function addToast(message: string, type: 'error' | 'success' = 'error') {
	const id = ++counter;
	toasts.push({ id, message, type });
	setTimeout(() => {
		toasts.splice(
			toasts.findIndex((t) => t.id === id),
			1
		);
	}, 5000);
}
