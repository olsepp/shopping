import { registerConnection, removeConnection } from '$lib/server/sse';

export function GET({ request }: { request: Request }) {
	const stream = new ReadableStream({
		start(controller) {
			const id = registerConnection(controller);
			request.signal.addEventListener('abort', () => removeConnection(id));
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
