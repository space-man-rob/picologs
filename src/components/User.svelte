<script lang="ts">
	import { Trash, X } from '@lucide/svelte';
	import type { Friend, Friend as UserDisplayType } from '../types';

	let { user, handleRemoveClick } = $props<{ user: UserDisplayType, handleRemoveClick?: (friend: Friend) => Promise<void> }>();

	// Reactive state to force re-render every minute
	let currentMinute = $state(new Date().getMinutes());

	// Update the time every minute
	$effect(() => {
		const interval = setInterval(() => {
			currentMinute = new Date().getMinutes();
		}, 60000); // Update every 60 seconds

		// Also calculate the initial delay to sync with the next minute
		const now = new Date();
		const secondsUntilNextMinute = 60 - now.getSeconds();
		const initialTimeout = setTimeout(() => {
			currentMinute = new Date().getMinutes();
			// After the initial sync, the interval will take over
		}, secondsUntilNextMinute * 1000);

		return () => {
			clearInterval(interval);
			clearTimeout(initialTimeout);
		};
	});

	function getLocalTime(timezone: string | undefined): string {
		if (!timezone) return '';
		try {
			const _ = currentMinute;
			return new Date().toLocaleTimeString('en-US', {
				timeZone: timezone,
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch (e) {
			return '(TZ Error)';
		}
	}

	function getCityFromTimezone(timezone: string | undefined): string {
		if (!timezone) return '';
		// Extract city name from timezone string (e.g., "America/New_York" -> "New York")
		const parts = timezone.split('/');
		let location = parts[parts.length - 1];

		// Handle special cases
		if (parts.length > 1 && parts[0] === 'Australia') {
			// For Australian cities, include the country
			location = parts.join(', ');
		} else if (parts.length > 2) {
			// For other multi-part timezones, use the last two parts
			location = parts.slice(-2).join(', ');
		}

		// Replace underscores with spaces
		return location.replace(/_/g, ' ');
	}

	let userModal: HTMLDialogElement | null = null;
</script>

{#if user}
	<button
		class="p-2.5 px-4 bg-white/[0.03] rounded flex flex-col items-start justify-between flex-grow flex-shrink-0 transition-all duration-400 shadow-[0_0_4px_rgba(0,0,0,0)] hover:bg-white/10 hover:shadow-[0_4px_4px_rgba(0,0,0,0.1)]"
		onclick={() => {
			userModal?.showModal();
		}}
	>
		<div class="flex items-center gap-2 mb-1.5">
			<span
				class={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${user.isOnline ? 'bg-[#4caf50]' : 'bg-[#757575]'}`}
				title={user.isOnline ? 'Online' : 'Offline'}
			>
			</span>
			<span class="font-normal text-[0.9rem] text-white whitespace-nowrap overflow-hidden text-ellipsis">
				{user.name || 'Unknown player'}
			</span>
		</div>
		<div>
			<!-- <p class="user-fc">FC: {user.friendCode}</p> -->
			{#if user.timezone}
				<p class="text-[0.6em] text-white/60 pl-5" title={user.timezone}>
					{getLocalTime(user.timezone)} ({getCityFromTimezone(user.timezone)})
				</p>
			{/if}
		</div>
	</button>
{/if}

<dialog
	id="user-modal"
	bind:this={userModal}
	class="border border-white/10 shadow-[0_0_3px_rgba(0,0,0,0.4)] rounded p-4 bg-[rgb(10,30,42)] text-white"
>
	<header class="flex items-center justify-between mb-4">
		<h3>{user.name}</h3>
		<button class="hover:cursor-pointer" onclick={() => userModal?.close()}>
			<X size={16} />
		</button>
	</header>
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-4">
			<p class="text-[0.9rem] text-white">Timezone: {user.timezone}</p>
			<p class="text-[0.9rem] text-white">Friend Code: {user.friendCode}</p>
			{#if handleRemoveClick}
				<button
					class="flex items-center justify-center gap-2 text-[0.9rem] text-white transition-colors duration-200 bg-red-600 rounded px-4 py-2 hover:bg-red-700"
					onclick={() => {
						handleRemoveClick(user);
					}}
				>
					<Trash size={16} /> Remove Friend
				</button>
			{/if}
		</div>
	</div>
</dialog>
