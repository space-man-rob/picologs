<script lang="ts">
	/**
	 * WebSocket connection component using Svelte 5 await blocks
	 * Provides clean handling of connection states: pending, connected, error
	 */
	import { getAppContext } from '$lib/appContext.svelte';
	import { connectWebSocket as apiConnectWebSocket } from '$lib/api';
	import type { Snippet } from 'svelte';

	const appCtx = getAppContext();

	let { onConnected, onError, connecting, connected, error } = $props<{
		onConnected?: () => void;
		onError?: (error: Error) => void;
		connecting?: Snippet;
		connected?: Snippet;
		error?: Snippet<[Error]>;
	}>();

	// Create a promise for WebSocket connection
	let connectionPromise = $state<Promise<void> | null>(null);

	// Function to initiate connection
	async function initiateConnection(): Promise<void> {
		if (!appCtx.discordUserId) {
			throw new Error('Please sign in with Discord to connect');
		}

		appCtx.connectionStatus = 'connecting';
		appCtx.connectionError = null;

		try {
			const socket = await apiConnectWebSocket(appCtx.discordUserId);
			appCtx.ws = socket;
			appCtx.connectionStatus = 'connected';
			appCtx.connectionError = null;
			appCtx.reconnectAttempts = 0;

			if (appCtx.reconnectTimer) {
				clearTimeout(appCtx.reconnectTimer);
				appCtx.reconnectTimer = null;
			}

			if (onConnected) {
				onConnected();
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error && error.message.includes('timeout')
					? "Can't connect to server - connection timed out"
					: 'Failed to connect to server';

			appCtx.connectionStatus = 'disconnected';
			appCtx.connectionError = errorMessage;
			appCtx.ws = null;
			appCtx.addNotification(errorMessage, 'error');

			if (onError && error instanceof Error) {
				onError(error);
			}

			throw error;
		}
	}

	// Start connection when component mounts (if user is signed in)
	$effect(() => {
		if (
			appCtx.isSignedIn &&
			appCtx.discordUserId &&
			!appCtx.ws &&
			!appCtx.autoConnectionAttempted
		) {
			appCtx.autoConnectionAttempted = true;
			connectionPromise = initiateConnection();
		}
	});

	// Expose function to retry connection
	export function retryConnection() {
		appCtx.autoConnectionAttempted = false;
		connectionPromise = initiateConnection();
	}
</script>

{#if connectionPromise}
	{#await connectionPromise}
		<!-- Connection in progress -->
		{#if connecting}
			{@render connecting()}
		{:else}
			<div class="flex items-center gap-2 px-4 py-2 text-sm text-white/70">
				<div class="animate-spin">⚡</div>
				<span>Connecting to server...</span>
			</div>
		{/if}
	{:then}
		<!-- Connected successfully -->
		{#if connected}
			{@render connected()}
		{/if}
	{:catch err}
		<!-- Connection failed -->
		{#if error}
			{@render error(err)}
		{:else}
			<div class="flex items-center gap-2 px-4 py-2 text-sm text-red-400">
				<span>❌</span>
				<span>{err.message || 'Connection failed'}</span>
				<button
					onclick={() => retryConnection()}
					class="ml-2 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs"
				>
					Retry
				</button>
			</div>
		{/if}
	{/await}
{/if}
