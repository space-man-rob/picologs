<script lang="ts">
	import { getAppContext } from '$lib/appContext.svelte';
	import { acceptFriendRequest, denyFriendRequest, removeFriend, sendFriendRequest } from '$lib/api';
	import type { ApiFriendRequest, ApiFriend } from '$lib/api';
	import { formatDistanceToNow } from 'date-fns';
	import SubNav from '../../components/SubNav.svelte';

	const appCtx = getAppContext();

	// Local state
	let friendCode = $state('');
	let isSubmitting = $state(false);
	let showRemoveConfirm = $state(false);
	let friendToRemove = $state<{ id: string; displayName: string } | null>(null);
	let isRemoving = $state(false);
	let copied = $state(false);

	// Derived state for organizing friends and requests
	let incomingRequests = $derived(
		appCtx.apiFriendRequests.filter((r: ApiFriendRequest) => r.direction === 'incoming')
	);

	let outgoingRequests = $derived(
		appCtx.apiFriendRequests.filter((r: ApiFriendRequest) => r.direction === 'outgoing')
	);

	let acceptedFriends = $derived(
		appCtx.apiFriends.filter((f: ApiFriend) => f.status === 'accepted')
	);

	// Helper functions
	function getDisplayName(friend: {
		friendDisplayName?: string;
		friendUsername?: string;
		friendPlayer?: string | null;
		fromUsername?: string;
		fromPlayer?: string | null;
	}): string {
		// For ApiFriend (accepted friends)
		if (friend.friendDisplayName) return friend.friendDisplayName;
		// For ApiFriendRequest (pending requests)
		if (friend.fromUsername) return friend.fromUsername;
		// Fallback to player name or username
		return friend.friendPlayer || friend.fromPlayer || 'Unknown';
	}

	function getAvatarUrl(discordId: string, avatar: string | null): string | null {
		if (!avatar || !discordId) return null;
		return `${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordId}/${avatar}.png?size=128`;
	}

	// Friend request handlers
	async function handleAcceptRequest(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await acceptFriendRequest(friendshipId);

			if (success) {
				appCtx.addNotification('Friend request accepted', 'success');
			} else {
				appCtx.addNotification('Failed to accept friend request', 'error');
			}
		} catch (error) {
			console.error('[Friends] Error accepting friend request:', error);
			appCtx.addNotification('Error accepting friend request', 'error');
		} finally {
			appCtx.processingFriendRequests.delete(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);
		}
	}

	async function handleDenyRequest(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await denyFriendRequest(friendshipId);

			if (success) {
				appCtx.addNotification('Friend request denied', 'info');
			} else {
				appCtx.addNotification('Failed to deny friend request', 'error');
			}
		} catch (error) {
			console.error('[Friends] Error denying friend request:', error);
			appCtx.addNotification('Error denying friend request', 'error');
		} finally {
			appCtx.processingFriendRequests.delete(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);
		}
	}

	async function handleRemoveFriend(friendId: string, displayName: string) {
		friendToRemove = { id: friendId, displayName };
		showRemoveConfirm = true;
	}

	async function confirmRemove() {
		if (!friendToRemove) return;

		isRemoving = true;
		try {
			const success = await removeFriend(friendToRemove.id);

			if (success) {
				appCtx.addNotification('Friend removed', 'info');
				showRemoveConfirm = false;
				friendToRemove = null;
			} else {
				appCtx.addNotification('Failed to remove friend', 'error');
			}
		} catch (error) {
			console.error('[Friends] Error removing friend:', error);
			appCtx.addNotification('Error removing friend', 'error');
		} finally {
			isRemoving = false;
		}
	}

	function cancelRemove() {
		showRemoveConfirm = false;
		friendToRemove = null;
	}

	// Add friend handler
	async function handleSubmit(e: Event) {
		e.preventDefault();

		if (!friendCode.trim()) {
			appCtx.addNotification('Please enter a friend code', 'error');
			return;
		}

		isSubmitting = true;

		try {
			const success = await sendFriendRequest(friendCode.trim().toUpperCase());

			if (success) {
				appCtx.addNotification('Friend request sent successfully', 'success');
				friendCode = '';
			} else {
				appCtx.addNotification('Failed to send friend request', 'error');
			}
		} catch (error) {
			console.error('[Friends] Error sending friend request:', error);
			appCtx.addNotification('Error sending friend request', 'error');
		} finally {
			isSubmitting = false;
		}
	}

	// Copy friend code
	async function copyFriendCode() {
		if (!appCtx.apiUserProfile?.friendCode) return;

		try {
			await navigator.clipboard.writeText(appCtx.apiUserProfile.friendCode);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('[Friends] Error copying friend code:', error);
			appCtx.addNotification('Failed to copy friend code', 'error');
		}
	}
</script>

<div class="flex h-full overflow-hidden">
	<SubNav />
	<div class="flex-1 overflow-y-auto p-6 space-y-6">
	<!-- Header -->
	<div>
		<h1 class="text-2xl font-bold text-white mb-2">Friends</h1>
		<p class="text-muted">Manage your friends and friend requests</p>
	</div>

	{#if appCtx.isLoadingFriends}
		<div class="space-y-4">
			<div class="p-6 bg-overlay-card rounded-lg border border-white-10">
				<p class="text-center text-muted">Loading friends...</p>
			</div>
		</div>
	{:else}
		<!-- Pending Requests Section -->
		{#if incomingRequests.length > 0 || outgoingRequests.length > 0}
			<div class="space-y-4">
				<h2 class="text-xl font-bold text-white">
					Pending Requests ({incomingRequests.length + outgoingRequests.length})
				</h2>

				<!-- Incoming Requests -->
				{#if incomingRequests.length > 0}
					<div class="space-y-3">
						{#each incomingRequests as request}
							<div
								class="p-5 bg-overlay-card rounded-lg border border-yellow-500/30 hover:border-yellow-500/50 transition-all"
							>
								<div class="flex items-center gap-4">
									<!-- Avatar -->
									{#if getAvatarUrl(request.fromDiscordId, request.fromAvatar)}
										<img
											src={getAvatarUrl(request.fromDiscordId, request.fromAvatar)}
											alt={getDisplayName(request)}
											class="w-14 h-14 rounded-full object-cover ring-2 ring-yellow-500/20"
										/>
									{:else}
										<div
											class="w-14 h-14 rounded-full bg-yellow-600/20 flex items-center justify-center ring-2 ring-yellow-500/20"
										>
											<span class="text-yellow-400 text-xl font-semibold">
												{getDisplayName(request).charAt(0).toUpperCase()}
											</span>
										</div>
									{/if}

									<!-- User Info -->
									<div class="flex-1 min-w-0">
										<h3 class="text-white font-semibold text-lg truncate">
											{getDisplayName(request)}
										</h3>
										{#if request.fromPlayer}
											<p class="text-sm text-muted truncate mt-0.5">{request.fromPlayer}</p>
										{/if}
										<p class="text-xs text-subtle mt-1.5">
											Received {formatDistanceToNow(new Date(request.createdAt), {
												addSuffix: true
											})}
										</p>
									</div>

									<!-- Action Buttons -->
									<div class="flex gap-2">
										<button
											onclick={() => handleAcceptRequest(request.id)}
											disabled={appCtx.processingFriendRequests.has(request.id)}
											class="p-2.5 text-green-400 hover:text-green-300 hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											title="Accept friend request"
										>
											<span class="text-xl">✓</span>
										</button>
										<button
											onclick={() => handleDenyRequest(request.id)}
											disabled={appCtx.processingFriendRequests.has(request.id)}
											class="p-2.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											title="Deny friend request"
										>
											<span class="text-xl">✕</span>
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Outgoing Requests -->
				{#if outgoingRequests.length > 0}
					<div class="space-y-3">
						<h3 class="text-sm font-medium text-muted uppercase tracking-wide">
							Sent Requests ({outgoingRequests.length})
						</h3>
						{#each outgoingRequests as request}
							<div class="p-5 bg-overlay-card rounded-lg border border-white-10">
								<div class="flex items-center gap-4">
									<!-- Avatar -->
									{#if getAvatarUrl(request.fromDiscordId, request.fromAvatar)}
										<img
											src={getAvatarUrl(request.fromDiscordId, request.fromAvatar)}
											alt={getDisplayName(request)}
											class="w-14 h-14 rounded-full object-cover ring-2 ring-white-10"
										/>
									{:else}
										<div
											class="w-14 h-14 rounded-full bg-white-10 flex items-center justify-center ring-2 ring-white-10"
										>
											<span class="text-white text-xl font-semibold">
												{getDisplayName(request).charAt(0).toUpperCase()}
											</span>
										</div>
									{/if}

									<!-- User Info -->
									<div class="flex-1 min-w-0">
										<h3 class="text-white font-semibold text-lg truncate">
											{getDisplayName(request)}
										</h3>
										{#if request.fromPlayer}
											<p class="text-sm text-muted truncate mt-0.5">{request.fromPlayer}</p>
										{/if}
										<p class="text-xs text-subtle mt-1.5">
											Sent {formatDistanceToNow(new Date(request.createdAt), {
												addSuffix: true
											})}
										</p>
									</div>

									<!-- Pending Badge -->
									<div
										class="flex items-center gap-2 text-yellow-400 px-3 py-2 bg-yellow-500/10 rounded-lg"
									>
										<span class="text-base">🕐</span>
										<span class="text-sm font-medium">Pending</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- Main Grid: Friends List + Add Friend -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Friends List -->
			<div class="lg:col-span-2 space-y-4">
				<h2 class="text-xl font-bold text-white">Friends ({acceptedFriends.length})</h2>

				{#if acceptedFriends.length === 0}
					<div class="p-8 bg-overlay-card rounded-lg border border-white-10 text-center">
						<p class="text-muted">No friends yet. Send a friend request to get started!</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						{#each acceptedFriends as friend}
							<div
								class="group p-5 bg-overlay-card rounded-lg border border-white-10 hover:border-white-20 transition-all hover:shadow-lg"
							>
								<div class="flex items-center gap-4">
									<!-- Avatar -->
									{#if getAvatarUrl(friend.friendDiscordId, friend.friendAvatar)}
										<img
											src={getAvatarUrl(friend.friendDiscordId, friend.friendAvatar)}
											alt={getDisplayName(friend)}
											class="w-14 h-14 rounded-full object-cover ring-2 ring-white-10 group-hover:ring-white-20 transition-all flex-shrink-0"
										/>
									{:else}
										<div
											class="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center ring-2 ring-white-10 group-hover:ring-white-20 transition-all flex-shrink-0"
										>
											<span class="text-blue-400 text-xl font-semibold">
												{getDisplayName(friend).charAt(0).toUpperCase()}
											</span>
										</div>
									{/if}

									<!-- User Info -->
									<div class="flex-1 min-w-0">
										<h3 class="text-white font-semibold text-lg truncate">
											{getDisplayName(friend)}
										</h3>
										{#if friend.friendPlayer}
											<p class="text-sm text-muted truncate mt-0.5">{friend.friendPlayer}</p>
										{/if}
										<p class="text-xs text-subtle mt-1.5">
											Friends {formatDistanceToNow(new Date(friend.createdAt), {
												addSuffix: true
											})}
										</p>
									</div>

									<!-- Remove Button -->
									<button
										onclick={() => handleRemoveFriend(friend.id, getDisplayName(friend))}
										class="p-2 text-red-400/70 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
										title="Remove friend"
									>
										<span class="text-lg">🗑️</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Add Friend Sidebar -->
			<div class="space-y-4">
				<h2 class="text-xl font-bold text-white">Add Friend</h2>

				<!-- Your Friend Code -->
				<div class="p-6 bg-overlay-card rounded-lg border border-white-10 space-y-4">
					<div>
						<label for="user-friend-code" class="block text-sm font-medium text-muted mb-2">
							Your Friend Code
						</label>
						<div class="flex gap-2">
							<input
								id="user-friend-code"
								type="text"
								value={appCtx.apiUserProfile?.friendCode || appCtx.cachedFriendCode || ''}
								readonly
								class="flex-1 min-w-0 px-4 py-2 bg-overlay-dark border border-white-10 rounded-lg text-white font-mono text-lg tracking-wider"
							/>
							<button
								type="button"
								onclick={copyFriendCode}
								disabled={!appCtx.apiUserProfile?.friendCode && !appCtx.cachedFriendCode}
								class="flex-shrink-0 px-4 py-2 btn-white-overlay text-white rounded border transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
								title="Copy friend code"
							>
								{#if copied}
									<span class="text-xl">✓</span>
								{:else}
									<span class="text-xl">📋</span>
								{/if}
							</button>
						</div>
						<p class="mt-2 text-xs text-subtle">
							Share this code with others so they can add you as a friend
						</p>
					</div>
				</div>

				<!-- Send Friend Request -->
				<form onsubmit={handleSubmit} class="p-6 bg-overlay-card rounded-lg border border-white-10">
					<div class="space-y-4">
						<div>
							<label for="friendCode" class="block text-sm font-medium text-muted mb-2">
								Friend's Code
							</label>
							<input
								type="text"
								id="friendCode"
								bind:value={friendCode}
								placeholder="Enter friend code (e.g., AB12CD34)"
								class="w-full px-4 py-2 bg-overlay-dark border border-white-10 rounded-lg text-white placeholder-subtle focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase"
								disabled={isSubmitting}
								maxlength="8"
							/>
							<p class="mt-2 text-xs text-subtle">
								Enter the 8-character friend code shared with you
							</p>
						</div>

						<button
							type="submit"
							disabled={isSubmitting}
							class="flex items-center justify-center gap-2 w-full px-4 py-2 btn-white-overlay text-white rounded border transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<span class="text-xl">➕</span>
							<span>{isSubmitting ? 'Sending...' : 'Send Friend Request'}</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
	</div>
</div>

<!-- Remove Friend Confirmation Modal -->
{#if showRemoveConfirm && friendToRemove}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
		<div class="bg-overlay-card rounded-lg border border-white-10 p-6 max-w-md w-full mx-4">
			<h3 class="text-xl font-bold text-white mb-4">Remove Friend</h3>
			<p class="text-muted mb-6">
				Are you sure you want to remove <span class="font-semibold text-white"
					>{friendToRemove.displayName}</span
				> from your friends list? This action cannot be undone.
			</p>
			<div class="flex gap-3">
				<button
					type="button"
					onclick={confirmRemove}
					disabled={isRemoving}
					class="flex-1 px-4 py-2 btn-danger text-white rounded transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isRemoving ? 'Removing...' : 'Remove Friend'}
				</button>
				<button
					type="button"
					onclick={cancelRemove}
					disabled={isRemoving}
					class="flex-1 px-4 py-2 btn-white-overlay text-white rounded-lg border transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}
