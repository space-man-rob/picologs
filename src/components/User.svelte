<script lang="ts">
	import type { Friend as UserDisplayType } from '../types';
	import { getAppContext } from '$lib/appContext.svelte';

	const appCtx = getAppContext();

	let { user } = $props<{ user: UserDisplayType }>();

	function selectUser() {
		// Toggle selection: if already selected, deselect
		if (appCtx.selectedUserId === user.id) {
			appCtx.selectedUserId = null;
		} else {
			appCtx.selectedUserId = user.id;
			// Deselect group when selecting a user
			appCtx.selectedGroupId = null;
		}
	}

	let isSelected = $derived(appCtx.selectedUserId === user.id);

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
</script>

{#if user}
	<button
		class="w-full p-2 rounded-lg flex items-center gap-2 transition-colors min-w-0 {isSelected ? 'bg-overlay-light' : 'hover:bg-overlay-subtle'}"
		onclick={selectUser}
	>
		<div class="relative flex-shrink-0">
			{#if user.avatar && user.discordId}
				<img
					src={user.avatar.startsWith('http') ? user.avatar : `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`}
					alt={user.name || 'User avatar'}
					class="w-8 h-8 rounded-full object-cover"
				/>
			{:else}
				<div class="w-8 h-8 rounded-full bg-overlay-light flex items-center justify-center text-white/60 text-xs font-medium">
					{(user.name || 'U')[0].toUpperCase()}
				</div>
			{/if}
			<span
				class={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${user.isOnline ? 'bg-green-500' : 'bg-white/40'}`}
				style="border-color: var(--color-bg-primary);"
				title={user.isOnline ? 'Online' : 'Offline'}
			>
			</span>
		</div>
		<div class="flex flex-col items-start min-w-0 flex-1 overflow-hidden">
			<span class="text-sm font-medium text-white truncate text-left max-w-full">
				{user.name || 'Unknown player'}
			</span>
			{#if user.timezone}
				<span class="text-xs text-white/40 truncate text-left max-w-full" title={user.timezone}>
					{getLocalTime(user.timezone)} · {getCityFromTimezone(user.timezone)}
				</span>
			{/if}
		</div>
	</button>
{/if}
