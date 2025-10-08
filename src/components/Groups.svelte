<script lang="ts">
	import type { Friend } from '../types';
	import type { ApiGroupMember } from '$lib/api';
	import { getAppContext } from '$lib/appContext.svelte';
	import User from './User.svelte';
	import Skeleton from './Skeleton.svelte';

	const appCtx = getAppContext();

	let { groups = [], groupMembers = new Map() } = $props();

	let expandedGroupId = $state<string | null>(null);

	// Sync expandedGroupId with selectedGroupId on initialization
	$effect(() => {
		if (appCtx.selectedGroupId) {
			expandedGroupId = appCtx.selectedGroupId;
		}
	});

	function selectGroup(groupId: string) {
		// Toggle selection: if already selected, deselect and collapse
		if (appCtx.selectedGroupId === groupId) {
			appCtx.selectedGroupId = null;
			expandedGroupId = null;
		} else {
			appCtx.selectedGroupId = groupId;
			expandedGroupId = groupId;
			// Deselect user when selecting a group
			appCtx.selectedUserId = null;
		}
	}

	let sortedGroups = $derived([...groups].sort((a, b) => a.name.localeCompare(b.name)));

	function getSortedMembers(groupId: string): ApiGroupMember[] {
		const members = groupMembers.get(groupId) || [];
		return [...members].sort((a, b) => {
			// Online members first
			if (a.isOnline && !b.isOnline) return -1;
			if (!a.isOnline && b.isOnline) return 1;
			// Then sort by name
			const aName = a.player || a.username;
			const bName = b.player || b.username;
			return aName.localeCompare(bName);
		});
	}
</script>

<div class="flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-[200px] scrollbar-custom">
	<h4 class="px-3 py-2 text-white/60 font-medium text-xs uppercase tracking-wide">
		Groups ({groups.length})
	</h4>
	{#if appCtx.isLoadingGroups && groups.length === 0}
		<Skeleton count={2} />
	{:else if groups.length === 0}
		<p class="text-sm text-white/40 text-center py-6">No groups yet</p>
	{:else}
		<div class="flex flex-col px-1 pb-2 gap-2">
			{#each sortedGroups as group (group.id)}
				{@const isSelected = appCtx.selectedGroupId === group.id}
				<div
					class="flex flex-col rounded-lg {isSelected
						? 'ring-2 ring-blue-500'
						: ''} transition-colors"
				>
					<button
						class="group-card sticky top-0 z-10 flex items-center gap-3 p-2 {isSelected
							? 'rounded-t-lg selected'
							: 'rounded-lg'} transition-colors"
						onclick={() => {
							selectGroup(group.id);
						}}
					>
						{#if group.avatar && (group.avatar.startsWith('http') || group.avatar.startsWith('/uploads'))}
							<img
								src={group.avatar}
								alt={group.name}
								class="w-8 h-8 rounded-full object-cover flex-shrink-0"
							/>
						{:else}
							<div class="text-2xl flex-shrink-0 leading-none">
								{group.avatar || '🗂️'}
							</div>
						{/if}
						<div class="flex flex-col items-start gap-1 min-w-0 flex-1">
							<div class="flex items-center gap-2 w-full">
								<span class="text-sm font-medium text-white truncate">
									{group.name}
								</span>
								{#if group.memberRole === 'owner'}
									<span
										class="text-[10px] uppercase tracking-wider text-yellow-500/80 flex-shrink-0"
									>
										Owner
									</span>
								{:else if group.memberRole === 'admin'}
									<span class="text-[10px] uppercase tracking-wider text-blue-500/80 flex-shrink-0">
										Admin
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-1 w-full overflow-hidden">
								{#if group.tags && group.tags.length > 0}
									<div class="flex items-center gap-1 min-w-0 flex-shrink overflow-hidden">
										{#each group.tags as tag (tag)}
											<span
												class="text-[10px] px-1.5 py-0.5 rounded bg-overlay-light text-white/60 whitespace-nowrap"
											>
												{tag}
											</span>
										{/each}
									</div>
								{/if}
								<span class="text-xs text-white/40 whitespace-nowrap flex-shrink-0">
									{group.memberCount}
									{group.memberCount === 1 ? 'member' : 'members'}
								</span>
							</div>
						</div>
					</button>

					{#if expandedGroupId === group.id}
						{@const members = getSortedMembers(group.id)}
						<div class="flex flex-col bg-overlay-dark">
							{#each members as member (member.userId)}
								{@const friendData: Friend = {
									id: member.userId,
									discordId: member.discordId,
									friendCode: '',
									name: member.player || member.username,
									avatar: member.avatar,
									status: 'confirmed',
									timezone: undefined,
									isOnline: member.isOnline,
									isConnected: member.isConnected
								}}
								<User user={friendData} />
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.group-card {
		background-color: rgb(10, 30, 42);
	}

	.group-card.selected {
		background-color: rgb(35, 53, 63);
	}

	.group-card:not(.selected):hover {
		background-color: rgba(255, 255, 255, 0.08);
	}
</style>
