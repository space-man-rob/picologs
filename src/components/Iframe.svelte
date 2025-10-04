<script lang="ts">
	import { getJwtToken } from '$lib/oauth';
	import { onMount } from 'svelte';
	import { getAppContext } from '$lib/appContext.svelte';
	import { goto } from '$app/navigation';

	type Props = {
		page: 'profile' | 'friends' | 'groups';
	};

	let { page }: Props = $props();

	function goBack() {
		goto('/');
	}

	let iframeUrl = $state('');
	let iframeElement = $state<HTMLIFrameElement | null>(null);
	let isInitialized = $state(false);
	const appCtx = getAppContext();

	// Map page names to URL paths
	const pagePathMap = {
		profile: 'profile-settings',
		friends: 'friends',
		groups: 'groups'
	};

	// Watch for page changes - use postMessage after initial load
	$effect(() => {
		if (!appCtx.isSignedIn) {
			console.log('[Iframe] Not signed in, clearing iframe');
			iframeUrl = '';
			isInitialized = false;
			return;
		}

		if (page && isInitialized && iframeElement?.contentWindow) {
			// After initial load, use postMessage to navigate without reload
			const targetPath = `/${pagePathMap[page]}`;
			const baseUrl = import.meta.env.DEV ? 'http://localhost:5173' : 'https://picologs.com';

			console.log('[Iframe] Sending postMessage to navigate to:', targetPath);
			iframeElement.contentWindow.postMessage(
				{ type: 'navigate', path: targetPath },
				baseUrl
			);
		} else if (page && !isInitialized) {
			// Initial load - set the src
			console.log('[Iframe] Initial load for page:', page);
			loadIframeUrl();
		}
	});

	async function loadIframeUrl() {
		// Get JWT token for authentication
		const jwt = await getJwtToken();

		// Build iframe URL with token parameter - start at first page
		const baseUrl = import.meta.env.DEV ? 'http://localhost:5173' : 'https://picologs.com';
		const url = new URL(`${baseUrl}/${pagePathMap[page]}`);

		if (jwt) {
			url.searchParams.set('token', jwt);
		}

		iframeUrl = url.toString();
	}

	function handleIframeLoad() {
		console.log('[Iframe] Iframe loaded, marking as initialized');
		isInitialized = true;
	}
</script>

<!-- Back Button -->
<button
	class="absolute top-[86px] left-4 text-sm cursor-pointer z-10 flex items-center gap-2 text-white"
	onclick={goBack}
	title="Back to Logs">
	⬅️ Back to Logs
</button>

<!-- Iframe Content -->
<div class="flex-1 overflow-hidden relative">
	{#if iframeUrl}
		<iframe
			bind:this={iframeElement}
			src={iframeUrl}
			title={page.charAt(0).toUpperCase() + page.slice(1)}
			class="w-full h-full border-0"
			sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
			onload={handleIframeLoad}
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
