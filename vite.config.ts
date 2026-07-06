import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => ({
					...config,
					include: [...config.include, '../drizzle.config.ts']
				})
			}
		}),
		SvelteKitPWA({
			kit: {
				adapterFallback: '/shopping-list'
			},
			workbox: {
				navigateFallback: '/shopping-list',
				navigateFallbackDenylist: [/^\/api\//],
				runtimeCaching: [
					{
						urlPattern: /^\/api\/sse/,
						handler: 'NetworkOnly' as const
					}
				]
			},
			manifest: {
				name: 'Meal Planner',
				short_name: 'Planner',
				description: 'Shared meal planner and shopping lists',
				theme_color: '#E07A5F',
				background_color: '#ffcffd',
				display: 'standalone',
				scope: '/',
				start_url: '/shopping-list',
				icons: [
					{
						src: '/icons/icon.svg',
						sizes: '512x512',
						type: 'image/svg+xml',
						purpose: 'any'
					}
				]
			}
		})
	]
});
