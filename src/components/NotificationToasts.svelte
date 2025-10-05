<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { getAppContext } from '$lib/appContext.svelte';

	const appCtx = getAppContext();

	function clearAll() {
		appCtx.notifications = [];
	}

	// Get emoji based on notification type
	function getEmoji(type: 'success' | 'error' | 'info') {
		switch (type) {
			case 'success':
				return '✓';
			case 'error':
				return '✕';
			case 'info':
				return 'ℹ';
			default:
				return 'ℹ';
		}
	}

	// Get background color based on notification type
	function getBgColor(type: 'success' | 'error' | 'info') {
		switch (type) {
			case 'success':
				return 'bg-green-600/20';
			case 'error':
				return 'bg-red-600/20';
			case 'info':
				return 'bg-blue-600/20';
			default:
				return 'bg-blue-600/20';
		}
	}
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
	{#if appCtx.notifications.length > 1}
		<button
			onclick={clearAll}
			transition:fade={{ duration: 200 }}
			class="self-end px-3 py-1.5 text-sm text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-750 transition-colors"
		>
			Clear all
		</button>
	{/if}
	{#each appCtx.notifications as notification (notification.id)}
		<div
			transition:fly={{ y: 20, duration: 300 }}
			class="bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden"
		>
			<div class="p-4">
				<div class="flex items-start gap-3">
					<div class="flex-shrink-0 p-2 {getBgColor(notification.type)} rounded-lg">
						<span class="text-xl">{getEmoji(notification.type)}</span>
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-gray-400 break-words">
							{notification.message}
						</p>
					</div>
					<button
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							appCtx.removeNotification(notification.id);
						}}
						class="flex-shrink-0 p-1 text-gray-400 hover:text-white transition-colors"
					>
						<span class="text-base">✕</span>
					</button>
				</div>
			</div>
		</div>
	{/each}
</div>
