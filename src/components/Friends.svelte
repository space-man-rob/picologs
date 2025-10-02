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

	let orderByOnlineAlphabetically = $derived(
		friendsList
			.filter((f: Friend) => f.status === 'confirmed')
			.sort((a: Friend, b: Friend) => a?.name?.localeCompare(b?.name || '') || 0)
			.sort((a: Friend, b: Friend) => (a.isOnline ? -1 : 1) - (b.isOnline ? -1 : 1))
	);
</script>

<div class="flex flex-col px-2 pb-2 pt-0 flex-grow overflow-y-auto min-w-[200px] [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]">
	<h4 class="my-2 text-white/70 font-medium text-[0.9em] pb-1.5 border-b border-white/10">
		Friends ({friendsList.filter((f: Friend) => f.status === 'confirmed').length})
	</h4>
	{#if friendsList.filter((f: Friend) => f.status === 'confirmed').length === 0}
		<p class="text-[0.85em] text-white/50 text-center mt-4">No friends yet. Add some!</p>
	{:else}
		<div class="flex flex-col gap-2">
		{#each orderByOnlineAlphabetically as friend (friend.id)}
			<div class="relative rounded-lg transition-colors duration-200 flex items-center justify-between">
					<User user={friend} {handleRemoveClick} />
					{#if friend.status !== 'confirmed'}
						<span class="inline-block ml-[0.7em] px-[0.6em] py-[0.1em] bg-[rgba(255,200,80,0.13)] text-[#ffc850] rounded-[5px] text-[0.85em] font-medium align-middle tracking-[0.01em]">Pending...</span>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
