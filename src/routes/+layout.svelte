<script lang="ts">
	import './layout.css';
	import { onNavigate, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { ShoppingCart, Book, ClipboardPen } from 'lucide-svelte';
	import { initSSE } from '$lib/sse.svelte';
	import { toasts } from '$lib/toast.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	let navigating = $state(false);
	let progress = $state(0);

	$effect(() => {
		if (data.user) initSSE();
	});

	onMount(() => {
		const standalone =
			(window.navigator as any).standalone ||
			window.matchMedia('(display-mode: standalone)').matches;
		if (!standalone) return;

		document.addEventListener('click', (e) => {
			const anchor = (e.target as HTMLElement)?.closest('a');
			if (!anchor || anchor.target === '_blank' || e.metaKey || e.ctrlKey) return;
			const url = new URL(anchor.href, window.location.href);
			if (url.origin !== window.location.origin) return;
			if (url.pathname === window.location.pathname && url.search === window.location.search) {
				return;
			}
			e.preventDefault();
			goto(url.pathname + url.search + url.hash);
		});
	});

	onNavigate((nav) => {
		if (!nav.to || nav.to.url.pathname === nav.from?.url.pathname) return;
		navigating = true;
		progress = 0;

		const interval = setInterval(() => {
			progress += (0.95 - progress) * 0.3;
			if (progress > 0.9) progress = 0.95;
		}, 80);

		const done = () => {
			clearInterval(interval);
			progress = 1;
			setTimeout(() => {
				navigating = false;
				progress = 0;
			}, 200);
		};

		if (document.startViewTransition) {
			const vt = document.startViewTransition(() => nav.complete);
			vt.finished.then(done).catch(done);
		} else {
			nav.complete.then(done).catch(done);
		}
	});
</script>

<svelte:head>
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="apple-mobile-web-app-title" content="Meal Planner" />
</svelte:head>

{#if navigating}
	<div
		class="fixed top-0 left-0 right-0 z-50 h-[3px] bg-amber-400 transition-all duration-150 ease-out"
		style="width: {progress * 100}%"
	></div>
{/if}

<div class="flex min-h-screen flex-col bg-background text-text">
	<main class="flex-1">{@render children()}</main>

	{#if $page.url.pathname !== '/login' && data.user}
		<nav
			class="fixed bottom-0 left-0 right-0 z-40 flex bg-white"
			style="padding-bottom: env(safe-area-inset-bottom)"
		>
			<svg
				class="absolute bottom-full left-0 right-0 w-full h-6"
				viewBox="0 0 375 24"
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path
					d="M0,26 C3,4 16,-2 25,15 C34,0 50,-3 60,13 C70,0 85,-4 95,14 C105,0 120,-3 130,15 C140,0 155,-4 165,13 C175,0 190,-3 200,12 C210,0 225,-4 235,14 C245,0 260,-3 270,15 C280,0 295,-4 305,13 C315,0 330,-3 340,12 C350,0 365,-4 375,26 L375,30 L0,30 Z"
					fill="white"
					stroke="black"
					stroke-width="2"
				/>
			</svg>
			<a
				href="/shopping-list"
				class={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
					$page.url.pathname.startsWith('/shopping-list') ? 'text-primary' : 'text-muted'
				}`}
			>
				<ShoppingCart class="h-6 w-6" />
				Shopping List
			</a>
			<a
				href="/backlog"
				class={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
					$page.url.pathname.startsWith('/backlog') ? 'text-primary' : 'text-muted'
				}`}
			>
				<ClipboardPen class="h-6 w-6" />
				Backlog
			</a>
			<a
				href="/recipes"
				class={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
					$page.url.pathname.startsWith('/recipes') ? 'text-primary' : 'text-muted'
				}`}
			>
				<Book class="h-6 w-6" />
				Recipes
			</a>
		</nav>
	{/if}
</div>

{#if toasts.length > 0}
	<div class="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2">
		{#each toasts as toast (toast.id)}
			<div
				class="rounded-xl border-2 border-black px-4 py-3 text-sm text-white shadow-lg {toast.type ===
				'error'
					? 'bg-red-500'
					: 'bg-primary'}"
			>
				{toast.message}
			</div>
		{/each}
	</div>
{/if}
