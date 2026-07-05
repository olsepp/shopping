import { invalidate } from '$app/navigation';
import { page } from '$app/stores';
import { get } from 'svelte/store';
import type { SSEEvent } from '$lib/types';
import { addToast } from '$lib/toast.svelte';

const SSE_KEY = '__shopping_sse__';
const DEDUP_WINDOW = 2000;

let processedEvents = new Map<string, number>();

function isDuplicate(key: string): boolean {
	const now = Date.now();
	for (const [k, ts] of processedEvents) {
		if (now - ts > DEDUP_WINDOW) processedEvents.delete(k);
	}
	if (processedEvents.has(key)) return true;
	processedEvents.set(key, now);
	return false;
}

function connectSSE() {
	const es = new EventSource('/api/sse');
	(window as unknown as Record<string, unknown>)[SSE_KEY] = es;

	es.addEventListener('item_checked', () => {
		invalidate('shopping-list');
	});

	es.addEventListener('shopping_list_updated', () => {
		invalidate('shopping-list');
	});

	es.addEventListener('list_assigned', (e: MessageEvent) => {
		const data = JSON.parse(e.data) as Extract<SSEEvent, { type: 'list_assigned' }>;
		const dedupKey = `list_assigned:${data.date}:${data.assignedTo}:${data.assignedBy}`;
		if (isDuplicate(dedupKey)) return;
		invalidate('shopping-list');
		if (data.assignedBy === get(page).data.user?.username) return;
		if (data.assignedToUsername) {
			addToast(`${data.assignedBy} assigned this list to ${data.assignedToUsername}`, 'success');
		} else {
			addToast(`${data.assignedBy} unassigned this list`, 'success');
		}
	});

	es.addEventListener('recipe_updated', () => {
		invalidate('recipes');
	});

	es.addEventListener('recipe_deleted', (e: MessageEvent) => {
		const data = JSON.parse(e.data) as Extract<SSEEvent, { type: 'recipe_deleted' }>;
		invalidate(`recipe:${data.recipeId}`);
	});

	es.addEventListener('pending_item_added', () => {
		invalidate('backlog');
	});

	es.addEventListener('pending_item_deleted', () => {
		invalidate('backlog');
	});
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		const es = (window as unknown as Record<string, unknown>)[SSE_KEY] as EventSource | undefined;
		es?.close();
	});
}

export function initSSE() {
	const existing = (window as unknown as Record<string, unknown>)[SSE_KEY] as
		| EventSource
		| undefined;
	if (existing && existing.readyState !== EventSource.CLOSED) return;
	connectSSE();
}

export function closeSSE() {
	const es = (window as unknown as Record<string, unknown>)[SSE_KEY] as EventSource | undefined;
	if (es) {
		es.close();
	}
}
