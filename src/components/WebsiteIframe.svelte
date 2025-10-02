<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		playerId: string | null;
		playerName: string | null;
		friendCode: string | null;
	}

	let { playerId, playerName, friendCode }: Props = $props();

	let iframeElement = $state<HTMLIFrameElement | null>(null);
	let isLoading = $state(true);
	let isDev = $state(false);

	// Determine website URL based on environment
	const websiteUrl = isDev ? 'http://localhost:5173' : 'https://picologs.com';

	onMount(() => {
		// Check if we're in development mode
		isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

		// Listen for messages from the iframe
		window.addEventListener('message', handleMessage);

		return () => {
			window.removeEventListener('message', handleMessage);
		};
	});

	function handleMessage(event: MessageEvent) {
		// Security: Verify origin
		const allowedOrigins = ['https://picologs.com', 'http://localhost:5173'];
		if (!allowedOrigins.includes(event.origin)) {
			console.warn('Ignored message from unauthorized origin:', event.origin);
			return;
		}

		// Handle messages from website iframe
		const { type, data } = event.data;

		switch (type) {
			case 'iframe_ready':
				// Send user data to iframe when it's ready
				sendUserDataToIframe();
				break;
			case 'friend_list_updated':
				// Handle friend list updates if needed
				console.log('Friend list updated:', data);
				break;
			case 'group_updated':
				// Handle group updates if needed
				console.log('Group updated:', data);
				break;
			default:
				console.log('Unknown message type from iframe:', type);
		}
	}

	function sendUserDataToIframe() {
		if (!iframeElement || !iframeElement.contentWindow) return;

		iframeElement.contentWindow.postMessage(
			{
				type: 'tauri_user_data',
				data: {
					playerId,
					playerName,
					friendCode,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
				}
			},
			websiteUrl
		);
	}

	function handleIframeLoad() {
		isLoading = false;
		// Give iframe a moment to set up listeners, then send user data
		setTimeout(() => {
			sendUserDataToIframe();
		}, 500);
	}

	// Watch for changes to user data and send updates
	$effect(() => {
		if (!isLoading && iframeElement) {
			sendUserDataToIframe();
		}
	});
</script>

<div class="relative w-full h-full min-h-[400px] bg-[#1a1a1a]">
	{#if isLoading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-white z-10">
			<div class="w-10 h-10 mx-auto mb-4 border-[3px] border-white/10 border-t-white rounded-full animate-spin"></div>
			<p class="m-0 text-sm opacity-70">Loading Friends & Groups...</p>
		</div>
	{/if}
	<iframe
		bind:this={iframeElement}
		src="{websiteUrl}?embedded=true"
		title="Picologs Friends & Groups"
		onload={handleIframeLoad}
		class="w-full h-full border-none transition-opacity duration-300 ease-in-out"
		class:opacity-100={!isLoading}
		class:opacity-0={isLoading}
	></iframe>
</div>
