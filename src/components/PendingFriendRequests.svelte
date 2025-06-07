<script lang="ts">
	import { Check, X } from '@lucide/svelte';

	let {
		pendingFriendRequests,
		removeFriendRequest,
		incomingFriendRequests = [],
		respondToFriendRequest
	} = $props();
</script>

<div class="pending-friend-requests">
	<h4>Friend Requests</h4>

	{#if incomingFriendRequests && incomingFriendRequests.length > 0}
		<h5 class="request-type-header">Incoming</h5>
		{#each incomingFriendRequests as request (request.fromUserId)}
			<div class="pending-friend-request incoming">
				<div class="request-info">
					<span class="friend-code">{request.fromPlayerName || request.fromFriendCode}</span>
					<span class="status-incoming">Incoming request</span>
				</div>
				<div class="actions">
					<button
						class="action-btn accept"
						title="Accept"
						onclick={() => respondToFriendRequest(true, request)}
					>
						<Check size={16} />
					</button>
					<button
						class="action-btn deny"
						title="Deny"
						onclick={() => respondToFriendRequest(false, request)}
					>
						<X size={16} />
					</button>
				</div>
			</div>
		{/each}
	{/if}

	{#if pendingFriendRequests.length > 0}
		<h5 class="request-type-header">Outgoing</h5>
		{#each pendingFriendRequests as request (request.friendCode)}
			<div class="pending-friend-request">
				<div class="request-info">
					<span class="friend-code">{request.friendCode}</span>
					<span class="status">Pending...</span>
				</div>
				<button
					class="remove-friend-btn"
					title="Cancel Request"
					onclick={() => removeFriendRequest(request.friendCode)}
				>
					<X size={16} />
				</button>
			</div>
		{/each}
	{/if}

	{#if pendingFriendRequests.length === 0 && (!incomingFriendRequests || incomingFriendRequests.length === 0)}
		<p class="no-requests">No pending friend requests</p>
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

	.request-type-header {
		font-size: 0.8em;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		margin: 0.5rem 0 0.2rem 0;
		padding-left: 0.5rem;
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

	.pending-friend-request.incoming {
		background-color: rgba(60, 180, 255, 0.05);
		border-color: rgba(60, 180, 255, 0.1);
	}
	.pending-friend-request.incoming:hover {
		background-color: rgba(60, 180, 255, 0.1);
		border-color: rgba(60, 180, 255, 0.2);
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

	.status-incoming {
		color: rgba(60, 180, 255, 0.8);
		font-size: 0.8em;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}

	.remove-friend-btn,
	.action-btn {
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

	.remove-friend-btn:hover,
	.action-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
	}

	.action-btn.accept:hover {
		color: #4ade80;
	}

	.remove-friend-btn:hover,
	.action-btn.deny:hover {
		color: #f87171;
	}
</style>
