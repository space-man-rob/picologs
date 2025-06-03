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
	<button class="user-display-container" onclick={() => {
		userModal?.showModal();
	}}>
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
			<!-- <p class="user-fc">FC: {user.friendCode}</p> -->
			{#if user.timezone}
				<p class="user-timezone" title={user.timezone}>
					{getLocalTime(user.timezone)} ({getCityFromTimezone(user.timezone)})
				</p>
			{/if}
		</div>
	</button>
{/if}

<dialog id="user-modal" bind:this={userModal}>
		<header>
			<h3>{user.name}</h3>
			<button class="close-modal" onclick={() => userModal?.close()}>
				<X size={16} />
			</button>
		</header>
		<div class="user-modal-body">
			<div class="user-modal-section">
				<p>Timezone: {user.timezone}</p>
				<p>Friend Code: {user.friendCode}</p>
				{#if handleRemoveClick}
					<button class="remove-friend-btn" onclick={() => {
						handleRemoveClick(user);
					}}>
						<Trash size={16} /> Remove Friend
					</button>
				{/if}
			</div>
		</div>
</dialog>

<style>
	.user-display-container {
		padding: .6rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 0.25rem;
		transition: all 0.4s ease;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-direction: column;
		flex-grow: 1;
		flex-shrink: 0;
		cursor: pointer;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0);

	}

	.user-display-container:hover {
		background: rgba(255, 255, 255, .1);
		cursor: pointer;
		box-shadow: 0 4px 4px rgba(0, 0, 0, .1);
	}

	.user-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.3rem;
	}

	.user-name {
		font-weight: 400;
		font-size: .9rem;
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

	
	.user-timezone {
		font-size: 0.6em;
		color: rgba(255, 255, 255, 0.6);
		padding-left: 1.2rem;
	}

	#user-modal {
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 0 3px rgba(0, 0, 0, 0.4);
		border-radius: 0.25rem;
		padding: 1rem;
		background-color: rgb(10, 30, 42);
		color: #fff;
	}

	.user-modal-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}
	
	.user-modal-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.user-modal-section p {
		font-size: 0.9rem;
		color: #fff;
	}

	.remove-friend-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #fff;
		cursor: pointer;
		transition: all 0.3s ease-in;
		background-color: rgba(255, 0, 0, 0.45);
		border-radius: 0.25rem;
		padding: 0.5rem 1rem;
	}

	.remove-friend-btn:hover {
		background-color: rgba(255, 0, 0, .65);

	}

	.close-modal:hover {
		cursor: pointer;
	}
</style>
