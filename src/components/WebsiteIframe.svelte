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
	const websiteUrl = isDev ? 'http://localhost:5173' : 'https://picologs.vercel.app';

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
		const allowedOrigins = ['https://picologs.vercel.app', 'http://localhost:5173'];
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

<div class="iframe-container">
	{#if isLoading}
		<div class="loading">
			<div class="spinner"></div>
			<p>Loading Friends & Groups...</p>
		</div>
	{/if}
	<iframe
		bind:this={iframeElement}
		src="{websiteUrl}?embedded=true"
		title="Picologs Friends & Groups"
		onload={handleIframeLoad}
		class:loaded={!isLoading}
	></iframe>
</div>

<style>
	.iframe-container {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 400px;
		background: #1a1a1a;
	}

	iframe {
		width: 100%;
		height: 100%;
		border: none;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	iframe.loaded {
		opacity: 1;
	}

	.loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: #fff;
		z-index: 10;
	}

	.spinner {
		width: 40px;
		height: 40px;
		margin: 0 auto 16px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.loading p {
		margin: 0;
		font-size: 14px;
		opacity: 0.7;
	}
</style>
