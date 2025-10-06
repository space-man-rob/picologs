<script lang="ts">
	import type { Friend } from '../types';
	import User from './User.svelte';
	import Skeleton from './Skeleton.svelte';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { getAppContext } from '$lib/appContext.svelte';
	import type { ApiFriendRequest } from '$lib/api';
	import { acceptFriendRequest, denyFriendRequest, fetchFriendRequests } from '$lib/api';

	const appCtx = getAppContext();

	let { friendsList = [], removeFriend } = $props();

	async function handleAcceptFriend(friendshipId: string) {
		try {
			console.log('[Friends] Accepting friend request:', friendshipId);
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await acceptFriendRequest(friendshipId);
			console.log('[Friends] Accept result:', success);

			if (success) {
				appCtx.addNotification('Friend request accepted', 'success');

				// Manually refresh friend requests to update UI immediately
				// The server should also send refetch_friend_requests, but this ensures immediate update
				console.log('[Friends] Refreshing friend requests after accept...');
				const requests = await fetchFriendRequests();
				appCtx.apiFriendRequests = requests;
				console.log('[Friends] Friend requests refreshed:', requests.length);
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

	async function handleDenyFriend(friendshipId: string) {
		try {
			console.log('[Friends] Denying friend request:', friendshipId);
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await denyFriendRequest(friendshipId);
			console.log('[Friends] Deny result:', success);

			if (success) {
				appCtx.addNotification('Friend request ignored', 'info');

				// Manually refresh friend requests to update UI immediately
				console.log('[Friends] Refreshing friend requests after deny...');
				const requests = await fetchFriendRequests();
				appCtx.apiFriendRequests = requests;
				console.log('[Friends] Friend requests refreshed:', requests.length);
			} else {
				appCtx.addNotification('Failed to ignore friend request', 'error');
			}
		} catch (error) {
			console.error('[Friends] Error ignoring friend request:', error);
			appCtx.addNotification('Error ignoring friend request', 'error');
		} finally {
			appCtx.processingFriendRequests.delete(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);
		}
	}

	async function handleRemoveClick(friend: Friend) {
		const answer = await ask(`Remove ${friend.name || friend.friendCode} from your friends?`, {
			title: 'Remove friend',
			kind: 'warning'
		});
		if (answer) {
			removeFriend(friend.id);
		}
	}

	let orderByOnlineAlphabetically = $derived(
		friendsList
			.filter((f: Friend) => f.status === 'confirmed')
			.sort((a: Friend, b: Friend) => a?.name?.localeCompare(b?.name || '') || 0)
			.sort((a: Friend, b: Friend) => (a.isOnline ? -1 : 1) - (b.isOnline ? -1 : 1))
	);

	let incomingRequests = $derived(
		appCtx.apiFriendRequests.filter((r: ApiFriendRequest) => r.direction === 'incoming')
	);

	let outgoingRequests = $derived(
		appCtx.apiFriendRequests.filter((r: ApiFriendRequest) => r.direction === 'outgoing')
	);

	// Debug logging for friends and user data
	$effect(() => {
		console.log('[Friends Debug] Current user data:', $state.snapshot({
			isSignedIn: appCtx.isSignedIn,
			discordUser: appCtx.discordUser,
			apiUserProfile: appCtx.apiUserProfile
		}));
		console.log('[Friends Debug] Friends list:', $state.snapshot(friendsList));
		console.log('[Friends Debug] API friends:', $state.snapshot(appCtx.apiFriends));
		console.log('[Friends Debug] Friend requests:', $state.snapshot({
			total: appCtx.apiFriendRequests.length,
			incoming: incomingRequests.length,
			outgoing: outgoingRequests.length,
			requests: appCtx.apiFriendRequests
		}));
	});
</script>

<div class="flex flex-col h-full overflow-y-auto min-w-[200px] scrollbar-custom">
	<!-- Pending Incoming Requests -->
	{#if incomingRequests.length > 0}
		<div class="border-b border-white/5">
			<h4 class="px-3 py-2 text-white/60 font-medium text-xs uppercase tracking-wide">
				Pending Requests ({incomingRequests.length})
			</h4>
			<div class="flex flex-col px-1 pb-2">
				{#each incomingRequests as request (request.id)}
					<div class="p-2 mb-1 bg-white/5 rounded hover:bg-white/10 transition-colors">
						<div class="flex items-center gap-2 mb-2">
							{#if request.avatar}
								<img
									src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.discordId}/${request.avatar}.png?size=32`}
									alt={request.username}
									class="w-6 h-6 rounded-full flex-shrink-0"
								/>
							{:else}
								<div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
									{request.username?.charAt(0).toUpperCase() || '?'}
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<p class="text-xs font-medium text-white truncate">{request.username}</p>
								{#if request.player}
									<p class="text-[10px] text-muted truncate">{request.player}</p>
								{/if}
							</div>
						</div>
						<div class="flex gap-1">
							<button
								onclick={() => handleAcceptFriend(request.id)}
								disabled={appCtx.processingFriendRequests.has(request.id)}
								class="flex-1 px-2 py-1 bg-green-600 text-white text-[10px] rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{appCtx.processingFriendRequests.has(request.id) ? 'Processing...' : 'Accept'}
							</button>
							<button
								onclick={() => handleDenyFriend(request.id)}
								disabled={appCtx.processingFriendRequests.has(request.id)}
								class="flex-1 px-2 py-1 border border-white/5 text-white text-[10px] rounded hover:bg-white/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{appCtx.processingFriendRequests.has(request.id) ? 'Processing...' : 'Ignore'}
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Outgoing Pending Requests -->
	{#if outgoingRequests.length > 0}
		<div class="border-b border-white/5">
			<h4 class="px-3 py-2 text-white/60 font-medium text-xs uppercase tracking-wide">
				Sent Requests ({outgoingRequests.length})
			</h4>
			<div class="flex flex-col px-1 pb-2">
				{#each outgoingRequests as request (request.id)}
					<div class="p-2 mb-1 bg-white/5 rounded">
						<div class="flex items-center gap-2">
							{#if request.avatar}
								<img
									src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.discordId}/${request.avatar}.png?size=32`}
									alt={request.username}
									class="w-6 h-6 rounded-full flex-shrink-0"
								/>
							{:else}
								<div class="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
									{request.username?.charAt(0).toUpperCase() || '?'}
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<p class="text-xs font-medium text-white truncate">{request.username}</p>
								{#if request.player}
									<p class="text-[10px] text-muted truncate">{request.player}</p>
								{/if}
							</div>
							<span class="text-[10px] text-yellow-500">Pending</span>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Friends List -->
	<h4 class="px-3 py-2 text-white/60 font-medium text-xs uppercase tracking-wide">
		Friends ({friendsList.filter((f: Friend) => f.status === 'confirmed').length})
	</h4>
	{#if appCtx.isLoadingFriends && friendsList.length === 0}
		<Skeleton count={3} />
	{:else if friendsList.filter((f: Friend) => f.status === 'confirmed').length === 0}
		<p class="text-sm text-white/40 text-center py-6">No friends yet</p>
	{:else}
		<div class="flex flex-col px-1 pb-2">
		{#each orderByOnlineAlphabetically as friend (friend.id)}
			<div class="relative flex items-center">
				<User user={friend} />
				{#if friend.status !== 'confirmed'}
					<span class="absolute right-2 px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-xs font-medium">Pending</span>
				{/if}
			</div>
			{/each}
		</div>
	{/if}
</div>
