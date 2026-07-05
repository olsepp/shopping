<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form } = $props();

	let username = $state('');
	let password = $state('');
</script>

<div class="flex min-h-screen items-center justify-center px-4">
	<div class="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-center text-2xl font-semibold text-text">Meal Planner</h1>

		<form method="POST" use:enhance>
			{#if form?.error}
				<p class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{form.error}</p>
			{/if}

			<label class="mb-1 block text-sm font-medium text-text" for="username"> Username </label>
			<input
				id="username"
				name="username"
				type="text"
				required
				bind:value={username}
				inputmode="text"
				autocomplete="username"
				class="mb-4 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base text-text placeholder-muted focus:border-primary focus:outline-none"
				placeholder="Enter username"
			/>

			<label class="mb-1 block text-sm font-medium text-text" for="password"> Password </label>
			<input
				id="password"
				name="password"
				type="password"
				required
				bind:value={password}
				autocomplete="current-password"
				class="mb-6 block w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base text-text placeholder-muted focus:border-primary focus:outline-none"
				placeholder="Enter password"
			/>

			<button
				type="submit"
				class="w-full rounded-lg bg-primary px-4 py-3 text-base font-medium text-white active:bg-primary-dark"
			>
				Sign in
			</button>
		</form>
	</div>
</div>
