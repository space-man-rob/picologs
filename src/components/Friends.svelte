<script lang="ts">
	import type { Friend } from '../types';
	import User from './User.svelte';
	import Skeleton from './Skeleton.svelte';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { getAppContext } from '$lib/appContext.svelte';

	const appCtx = getAppContext();

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

	let orderByOnlineAlphabetically = $derived(
		friendsList
			.filter((f: Friend) => f.status === 'confirmed')
			.sort((a: Friend, b: Friend) => a?.name?.localeCompare(b?.name || '') || 0)
			.sort((a: Friend, b: Friend) => (a.isOnline ? -1 : 1) - (b.isOnline ? -1 : 1))
	);
</script>

<div class="flex flex-col h-full overflow-y-auto min-w-[200px] scrollbar-custom">
	<h4 class="px-3 py-2 text-white/60 font-medium text-xs uppercase tracking-wide">
		Friends ({friendsList.filter((f: Friend) => f.status === 'confirmed').length})
	</h4>
	{#if appCtx.isLoadingFriends && friendsList.length === 0}
		<Skeleton count={3} />
	{:else if friendsList.filter((f: Friend) => f.status === 'confirmed').length === 0}
		<p class="text-sm text-white/40 text-center py-6">No friends yet</p>
	{:else}
		<div class="flex flex-col px-2 pb-2">
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
