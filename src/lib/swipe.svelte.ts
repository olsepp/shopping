export function swipe(
	node: HTMLElement,
	handlers: {
		onSwipeLeft?: () => void;
		onSwipeRight?: () => void;
		onStateChange?: (offsetX: number) => void;
		threshold?: number;
	}
) {
	let startX = 0;
	let startY = 0;
	let swiping = false;
	let offsetX = 0;
	let snapTimer: ReturnType<typeof setTimeout> | null = null;
	const threshold = handlers.threshold ?? 80;

	function begin(x: number, y: number) {
		startX = x;
		startY = y;
		swiping = true;
		offsetX = 0;
		if (snapTimer) {
			clearTimeout(snapTimer);
			snapTimer = null;
		}
		node.style.transition = 'none';
		handlers.onStateChange?.(0);
	}

	function move(x: number, y: number) {
		if (!swiping) return;
		const dx = x - startX;
		const dy = y - startY;

		if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
			swiping = false;
			offsetX = 0;
			snapBack();
			return;
		}

		offsetX = dx;
		handlers.onStateChange?.(dx);
	}

	function snapBack() {
		node.style.transition = 'transform 0.25s cubic-bezier(0.25, 0.1, 0.25, 1)';
		offsetX = 0;
		handlers.onStateChange?.(0);
		snapTimer = setTimeout(() => {
			node.style.transition = 'none';
			snapTimer = null;
		}, 260);
	}

	function end() {
		if (!swiping) {
			offsetX = 0;
			handlers.onStateChange?.(0);
			return;
		}
		swiping = false;

		if (offsetX > threshold) {
			handlers.onSwipeRight?.();
		} else if (offsetX < -threshold) {
			handlers.onSwipeLeft?.();
		}
		snapBack();
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 1) return;
		e.preventDefault();
		begin(e.touches[0].clientX, e.touches[0].clientY);
	}

	function onTouchMove(e: TouchEvent) {
		move(e.touches[0].clientX, e.touches[0].clientY);
	}

	function onMouseDown(e: MouseEvent) {
		begin(e.clientX, e.clientY);
	}

	function onMouseMove(e: MouseEvent) {
		if (!swiping) return;
		move(e.clientX, e.clientY);
	}

	function onMouseUp() {
		end();
	}

	node.addEventListener('touchstart', onTouchStart, { passive: true });
	node.addEventListener('touchmove', onTouchMove, { passive: true });
	node.addEventListener('touchend', end);
	node.addEventListener('mousedown', onMouseDown);
	node.addEventListener('mousemove', onMouseMove);
	node.addEventListener('mouseup', onMouseUp);
	node.addEventListener('mouseleave', end);

	// Prevent text selection while dragging
	node.style.userSelect = 'none';

	return {
		update(newHandlers: typeof handlers) {
			handlers = newHandlers;
		},
		destroy() {
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			node.removeEventListener('touchend', end);
			node.removeEventListener('mousedown', onMouseDown);
			node.removeEventListener('mousemove', onMouseMove);
			node.removeEventListener('mouseup', onMouseUp);
			node.removeEventListener('mouseleave', end);
		}
	};
}
