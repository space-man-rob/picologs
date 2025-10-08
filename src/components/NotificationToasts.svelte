<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { CheckCircle2, XCircle, Info, X } from '@lucide/svelte';
	import { getAppContext } from '$lib/appContext.svelte';

	const appCtx = getAppContext();

	function clearAll() {
		appCtx.notifications = [];
	}

	// Get background color based on notification type
	function getBgColor(type: 'success' | 'error' | 'info') {
		switch (type) {
			case 'success':
				return 'bg-green-600';
			case 'error':
				return 'bg-red-600';
			case 'info':
				return 'bg-indigo-600';
			default:
				return 'bg-indigo-600';
		}
	}

	// Get border color based on notification type
	function getBorderColor(type: 'success' | 'error' | 'info') {
		switch (type) {
			case 'success':
				return 'border-green-500/50';
			case 'error':
				return 'border-red-500/50';
			case 'info':
				return 'border-indigo-500/50';
			default:
				return 'border-indigo-500/50';
		}
	}
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
	{#if appCtx.notifications.length > 1}
		<button
			onclick={clearAll}
			transition:fade={{ duration: 200 }}
			class="self-end px-3 py-1.5 text-sm text-muted hover:text-white bg-panel-dark border border-panel rounded-lg hover:bg-overlay-light transition-colors"
		>
			Clear all
		</button>
	{/if}
	{#each appCtx.notifications as notification (notification.id)}
		<div
			transition:fly={{ y: 20, duration: 300 }}
			class="bg-slate-800/95 backdrop-blur-sm border-2 {getBorderColor(
				notification.type
			)} rounded-lg shadow-xl overflow-hidden"
		>
			<div class="p-4">
				<div class="flex items-center gap-3">
					<div
						class="flex-shrink-0 w-10 h-10 flex items-center justify-center {getBgColor(
							notification.type
						)} rounded-lg text-white"
					>
						{#if notification.customIcon}
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html notification.customIcon}
						{:else if notification.type === 'success'}
							<CheckCircle2 size={20} />
						{:else if notification.type === 'error'}
							<XCircle size={20} />
						{:else}
							<Info size={20} />
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-white break-words">
							{notification.message}
						</p>
					</div>
					<button
						onclick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							appCtx.removeNotification(notification.id);
						}}
						class="flex-shrink-0 w-6 h-6 flex items-center justify-center text-white/60 hover:text-white transition-colors rounded hover:bg-white/10"
					>
						<X size={16} />
					</button>
				</div>
			</div>
		</div>
	{/each}
</div>
