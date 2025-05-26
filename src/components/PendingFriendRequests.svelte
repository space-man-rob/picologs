<script lang="ts">
	import { X } from "@lucide/svelte";

	let { pendingFriendRequests, removeFriendRequest } = $props();

</script>

<div class="pending-friend-requests">
	<h4>Friend Requests</h4>
	{#if pendingFriendRequests.length === 0}
		<p class="no-requests">No pending friend requests</p>
	{:else}
		{#each pendingFriendRequests as request}
			<div class="pending-friend-request">
				<div class="request-info">
					<span class="friend-code">{request.friendCode}</span>
					<span class="status">Pending...</span>
				</div>
				<button 
					class="remove-friend-btn" 
					title="Remove friend request"
					onclick={() => removeFriendRequest(request.friendCode)}>
					<X size={16} />
				</button>
			</div>
		{/each}
	{/if}
</div>

<style>
	.pending-friend-requests {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 0.5rem;
	}

	h4 {
		margin: 0.5rem 0 0;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
		font-size: 0.9em;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.no-requests {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.9em;
		text-align: center;
		margin: 1rem 0;
	}

	.pending-friend-request {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem;
		border-radius: 0.5rem;
		background-color: rgba(255, 165, 0, 0.05);
		border: 1px solid rgba(255, 165, 0, 0.1);
		transition: all 0.2s ease;
	}

	.pending-friend-request:hover {
		background-color: rgba(255, 165, 0, 0.1);
		border-color: rgba(255, 165, 0, 0.2);
	}

	.request-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.friend-code {
		color: #fff;
		font-weight: 500;
		font-size: 0.95em;
	}

	.status {
		color: rgba(255, 165, 0, 0.8);
		font-size: 0.8em;
	}

	.remove-friend-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.remove-friend-btn:hover {
		color: rgba(255, 255, 255, 0.8);
		background-color: rgba(255, 255, 255, 0.1);
	}
</style>
