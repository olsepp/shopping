import type { SSEEvent } from '$lib/types';

type SSEController = ReadableStreamDefaultController;
type ConnectionId = string;

const connections = new Map<
	ConnectionId,
	{ controller: SSEController; ping: ReturnType<typeof setInterval> }
>();
let counter = 0;
const encoder = new TextEncoder();

export function registerConnection(controller: SSEController): ConnectionId {
	const id = String(++counter);
	const ping = setInterval(() => {
		try {
			controller.enqueue(encoder.encode(': ping\n\n'));
		} catch {
			removeConnection(id);
		}
	}, 15000);
	connections.set(id, { controller, ping });
	return id;
}

export function removeConnection(id: ConnectionId): void {
	const conn = connections.get(id);
	if (conn) {
		clearInterval(conn.ping);
		connections.delete(id);
	}
}

function send(controller: SSEController, event: SSEEvent, id: ConnectionId): void {
	const data = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
	try {
		controller.enqueue(encoder.encode(data));
	} catch {
		removeConnection(id);
	}
}

export function broadcast(event: SSEEvent): void {
	for (const [id, conn] of connections) {
		send(conn.controller, event, id);
	}
}
