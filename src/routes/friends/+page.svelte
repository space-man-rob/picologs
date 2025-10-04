<script lang="ts">
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';
	import { getJwtToken } from '$lib/oauth';
	import { onMount } from 'svelte';

	let friendsUrl = $state('');

	onMount(async () => {
		// Get JWT token for authentication
		const jwt = await getJwtToken();

		// Build friends URL with token parameter
		const baseUrl = import.meta.env.DEV ? 'http://localhost:5173' : 'https://picologs.com';
		const url = new URL(`${baseUrl}/friends`);

		if (jwt) {
			url.searchParams.set('token', jwt);
		}

		friendsUrl = url.toString();
	});

	function goBack() {
		goto('/');
	}
</script>

<main class="p-0 text-white h-dvh overflow-hidden flex flex-col">
	<!-- Back Button Bar -->
	<div class="bg-[rgb(10,30,42)] px-4 py-2 border-b border-white/20">
		<button
			class="bg-white/10 text-white border border-white/20 px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-2 hover:bg-white/20"
			onclick={goBack}
			title="Back to Logs">
			<ArrowLeft size={18} /> Back
		</button>
	</div>

	<div class="flex-1 overflow-hidden">
		{#if friendsUrl}
			<iframe
				src={friendsUrl}
				title="Friends"
				class="w-full h-full border-0"
				sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
			></iframe>
		{:else}
			<div class="flex items-center justify-center h-full text-white/70">
				<div class="text-center">
					<div class="w-10 h-10 mx-auto mb-4 border-[3px] border-white/10 border-t-white rounded-full animate-spin"></div>
					<p>Loading...</p>
				</div>
			</div>
		{/if}
	</div>
</main>
