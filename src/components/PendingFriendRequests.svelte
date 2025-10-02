<script lang="ts">
	import { Check, X } from '@lucide/svelte';

	let {
		pendingFriendRequests,
		removeFriendRequest,
		incomingFriendRequests = [],
		respondToFriendRequest
	} = $props();
</script>

<div class="flex flex-col gap-3 px-2">
	<h4 class="mt-2 mb-0 text-white/70 font-medium text-[0.9em] pb-1.5 border-b border-white/10">
		Friend Requests
	</h4>

	{#if incomingFriendRequests && incomingFriendRequests.length > 0}
		<h5 class="text-[0.8em] text-white/50 uppercase mt-2 mb-0.5 pl-2">Incoming</h5>
		{#each incomingFriendRequests as request (request.fromUserId)}
			<div
				class="flex items-center justify-between p-3 rounded-lg bg-[rgba(60,180,255,0.05)] border border-[rgba(60,180,255,0.1)] transition-all duration-200 hover:bg-[rgba(60,180,255,0.1)] hover:border-[rgba(60,180,255,0.2)]"
			>
				<div class="flex flex-col gap-1">
					<span class="text-white font-medium text-[0.95em]"
						>{request.fromPlayerName || request.fromFriendCode}</span
					>
					<span class="text-[rgba(60,180,255,0.8)] text-[0.8em]">Incoming request</span>
				</div>
				<div class="flex gap-2">
					<button
						class="bg-transparent border-0 text-white/50 cursor-pointer p-1 rounded flex items-center justify-center transition-all duration-200 hover:bg-white/10 hover:text-green-400"
						title="Accept"
						onclick={() => respondToFriendRequest(true, request)}
					>
						<Check size={16} />
					</button>
					<button
						class="bg-transparent border-0 text-white/50 cursor-pointer p-1 rounded flex items-center justify-center transition-all duration-200 hover:bg-white/10 hover:text-red-400"
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
		<h5 class="text-[0.8em] text-white/50 uppercase mt-2 mb-0.5 pl-2">Outgoing</h5>
		{#each pendingFriendRequests as request (request.friendCode)}
			<div
				class="flex items-center justify-between p-3 rounded-lg bg-[rgba(255,165,0,0.05)] border border-[rgba(255,165,0,0.1)] transition-all duration-200 hover:bg-[rgba(255,165,0,0.1)] hover:border-[rgba(255,165,0,0.2)]"
			>
				<div class="flex flex-col gap-1">
					<span class="text-white font-medium text-[0.95em]">{request.friendCode}</span>
					<span class="text-[rgba(255,165,0,0.8)] text-[0.8em]">Pending...</span>
				</div>
				<button
					class="bg-transparent border-0 text-white/50 cursor-pointer p-1 rounded flex items-center justify-center transition-all duration-200 hover:bg-white/10 hover:text-red-400"
					title="Cancel Request"
					onclick={() => removeFriendRequest(request.friendCode)}
				>
					<X size={16} />
				</button>
			</div>
		{/each}
	{/if}

	{#if pendingFriendRequests.length === 0 && (!incomingFriendRequests || incomingFriendRequests.length === 0)}
		<p class="text-white/50 text-[0.9em] text-center my-4">No pending friend requests</p>
	{/if}
</div>
