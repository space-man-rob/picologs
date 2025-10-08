<script lang="ts">
	import type { Friend } from '../types';
	import User from './User.svelte';
	import Skeleton from './Skeleton.svelte';
	import { getAppContext } from '$lib/appContext.svelte';
	import type { ApiFriendRequest } from '$lib/api';
	import { acceptFriendRequest, denyFriendRequest, fetchFriendRequests } from '$lib/api';
	import { getDiscordColor } from '$lib/discord-colors';

	const appCtx = getAppContext();

	let { friendsList = [] } = $props();

	// Check if avatar is a valid Discord avatar hash (not just a default avatar index)
	function isValidAvatarHash(avatar: string | null | undefined): boolean {
		if (!avatar) return false;
		// Discord avatar hashes are alphanumeric strings (usually 32 chars)
		// Default avatars are just single digits (0-5), which are not valid custom avatars
		const cleanAvatar = avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
		return cleanAvatar.length > 2 && /^[a-zA-Z0-9_]+$/.test(cleanAvatar);
	}

	async function handleAcceptFriend(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await acceptFriendRequest(friendshipId);

			if (success) {
				appCtx.addNotification('Friend request accepted', 'success');

				// Manually refresh friend requests to update UI immediately
				// The server should also send refetch_friend_requests, but this ensures immediate update
				const requests = await fetchFriendRequests();
				appCtx.apiFriendRequests = requests;
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
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

			const success = await denyFriendRequest(friendshipId);

			if (success) {
				appCtx.addNotification('Friend request ignored', 'info');

				// Manually refresh friend requests to update UI immediately
				const requests = await fetchFriendRequests();
				appCtx.apiFriendRequests = requests;
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
							{#if request.avatar && isValidAvatarHash(request.avatar)}
								<img
									src={request.avatar.startsWith('http')
										? request.avatar
										: `${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.discordId}/${request.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=32`}
									alt={request.username}
									class="w-6 h-6 rounded-full flex-shrink-0"
								/>
							{:else}
								<div
									class="w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-white/10 flex-shrink-0"
									style="background-color: {getDiscordColor(request.id)}33;"
								>
									<svg width="14" height="14" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
											fill="white"
										/>
									</svg>
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
							{#if request.avatar && isValidAvatarHash(request.avatar)}
								<img
									src={request.avatar.startsWith('http')
										? request.avatar
										: `${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.discordId}/${request.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=32`}
									alt={request.username}
									class="w-6 h-6 rounded-full flex-shrink-0"
								/>
							{:else}
								<div
									class="w-6 h-6 rounded-full flex items-center justify-center ring-2 ring-white/10 flex-shrink-0"
									style="background-color: {getDiscordColor(request.id)}33;"
								>
									<svg width="14" height="14" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path
											d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
											fill="white"
										/>
									</svg>
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
						<span
							class="absolute right-2 px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-xs font-medium"
							>Pending</span
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
