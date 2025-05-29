<script lang="ts">
	import type { Friend as UserDisplayType } from '../types';

	let { user } = $props<{ user: UserDisplayType }>();

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

	function getGMTOffset(timezone: string | undefined): string {
		if (!timezone) return '';
		try {
			const now = new Date();

			// Format the date in the target timezone to get the offset
			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				timeZoneName: 'shortOffset'
			});

			const parts = formatter.formatToParts(now);
			const offsetPart = parts.find((part) => part.type === 'timeZoneName');

			if (offsetPart && offsetPart.value) {
				// This will be something like "GMT+11" or "GMT-5"
				return offsetPart.value;
			}

			// Fallback: calculate offset manually
			const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
			const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
			const offsetHours = Math.round((tzDate.getTime() - utcDate.getTime()) / (1000 * 60 * 60));

			const sign = offsetHours >= 0 ? '+' : '';
			return `GMT${sign}${offsetHours}`;
		} catch (e) {
			console.warn('Could not calculate GMT offset for timezone:', timezone, e);
			return '';
		}
	}
</script>

{#if user}
	<div class="user-display-container">
		<div class="user-header">
			<span
				class={`status-indicator ${user.isOnline ? 'online' : 'offline'}`}
				title={user.isOnline ? 'Online' : 'Offline'}>
			</span>
			<span class="user-name">
				{user.name || 'Unknown player'}
			</span>
		</div>
		<div class="user-details">
			<p class="user-fc">FC: {user.friendCode}</p>
			{#if user.timezone}
				<p class="user-timezone" title={user.timezone}>
					{getLocalTime(user.timezone)} ({getCityFromTimezone(user.timezone)})
				</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.user-display-container {
		padding: 0.75rem;
		background-color: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 0.5rem;
	}

	.user-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.user-name {
		font-weight: 600;
		font-size: 1.1em;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-indicator {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-indicator.online {
		background-color: #4caf50;
	}

	.status-indicator.offline {
		background-color: #757575;
	}

	.user-details p {
		font-size: 0.85em;
		color: rgba(255, 255, 255, 0.7);
		margin: 0.2rem 0;
	}

	.user-fc {
		font-family: monospace;
	}
	
	.user-timezone {
		font-size: 0.85em;
		color: rgba(255, 255, 255, 0.6);
	}
</style>
