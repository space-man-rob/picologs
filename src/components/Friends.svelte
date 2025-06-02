<script lang="ts">
	import type { Friend } from '../types';
	import User from './User.svelte';
	import { X } from '@lucide/svelte';
	import { ask } from '@tauri-apps/plugin-dialog';

	let { friendsList = [], removeFriend } = $props();

	async function handleRemoveClick(friend: Friend) {
		const answer = await ask(`Remove ${friend.name || friend.friendCode} from your friends?`, {
			title: 'Remove friend',
			kind: 'warning'
		});
		if (answer) {
			removeFriend(friend.id);
		}
	}
</script>

<div class="friends-list-container">
	<h4>Friends ({friendsList.filter((f: Friend) => f.status === 'confirmed').length})</h4>
	{#if friendsList.filter((f: Friend) => f.status === 'confirmed').length === 0}
		<p class="no-friends-text">No friends yet. Add some!</p>
	{:else}
		{#each friendsList as friend (friend.id)}
			<div class="friend-card">
				<div class="friend-info">
					<User user={friend} />
					{#if friend.status !== 'confirmed'}
						<span class="pending-label">Pending...</span>
					{/if}
				</div>
				<button
					class="remove-friend-btn"
					title="Remove friend"
					onclick={() => handleRemoveClick(friend)}>
					<X size={16} />
				</button>
			</div>
		{/each}
	{/if}
</div>

<style>
	.friends-list-container {
		display: flex;
		flex-direction: column;
		padding: 0 0.5rem;
		flex-grow: 1;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.3) rgba(0, 0, 0, 0.2);
	}
	h4 {
		margin: 0.5rem 0;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		font-size: 0.9em;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}
	.no-friends-text {
		font-size: 0.85em;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		margin-top: 1rem;
	}

	.friend-card {
		position: relative;
		border-radius: 0.5rem;
		transition: background-color 0.2s ease;
	}

	.friend-info {
		flex: 1 1 auto;
		min-width: 0;
	}

	.remove-friend-btn {
		background: none;
		color: rgba(255, 128, 128, 0.7);
		border: none;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		position: absolute;
		right: 0.7rem;
		top: 0.7rem;
	}

	.remove-friend-btn:hover {
		background: rgba(255, 80, 80, 0.15);
		color: #ff8080;
	}

	.pending-label {
		display: inline-block;
		margin-left: 0.7em;
		padding: 0.1em 0.6em;
		background: rgba(255, 200, 80, 0.13);
		color: #ffc850;
		border-radius: 5px;
		font-size: 0.85em;
		font-weight: 500;
		vertical-align: middle;
		letter-spacing: 0.01em;
	}
</style>
