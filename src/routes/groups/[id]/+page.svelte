<script lang="ts">
	import { getAppContext } from '$lib/appContext.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { fetchGroupMembers, updateGroup, leaveGroup, inviteFriendToGroup, removeMemberFromGroup } from '$lib/api';
	import SubNav from '../../../components/SubNav.svelte';

	const appCtx = getAppContext();

	// Get group ID from URL params
	let groupId = $derived($page.params.id);

	// Find group in cached data
	let group = $derived.by(() => {
		const foundGroup = appCtx.groups.find(g => g.id === groupId);
		console.log('[Group Detail] Looking for group ID:', groupId);
		console.log('[Group Detail] Available groups:', appCtx.groups.map(g => ({ id: g.id, name: g.name })));
		console.log('[Group Detail] Found group:', foundGroup);
		return foundGroup;
	});

	// State
	let members = $state<any[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let showLeaveConfirm = $state(false);
	let showInviteModal = $state(false);
	let showRemoveMemberConfirm = $state(false);

	// Edit form state
	let editName = $state('');
	let editDescription = $state('');
	let editTags = $state<string[]>([]);
	let tagInput = $state('');

	// Modal state
	let memberToRemove = $state<any>(null);
	let isRemoving = $state(false);
	let selectedFriends = $state<string[]>([]);
	let isSendingInvites = $state(false);
	let inviteError = $state('');
	let inviteSuccess = $state('');

	// Load members when component mounts or groupId changes
	$effect(() => {
		console.log('[Group Detail] Effect triggered - groupId:', groupId, 'group:', group);
		if (groupId) {
			loadMembers();
		}
	});

	async function loadMembers() {
		console.log('[Group Detail] loadMembers called - groupId:', groupId, 'group exists:', !!group);

		if (!group) {
			console.log('[Group Detail] No group found in cache, cannot load members');
			isLoading = false;
			return;
		}

		console.log('[Group Detail] Fetching members for group:', group.name);
		isLoading = true;
		try {
			const membersList = await fetchGroupMembers(groupId);
			console.log('[Group Detail] Received members:', membersList);
			members = membersList;
		} catch (error) {
			console.error('[Group Detail] Error loading members:', error);
			console.error('[Group Detail] Error details:', {
				message: error.message,
				stack: error.stack
			});
			// Don't show error notification - group might just be loading
			// appCtx.addNotification('Error loading group members', 'error');
		} finally {
			isLoading = false;
			console.log('[Group Detail] Loading complete - isLoading:', isLoading);
		}
	}

	// Helper functions
	function getDisplayName(member: any): string {
		if (member.usePlayerAsDisplayName && member.player) {
			return member.player;
		}
		return member.username || 'Unknown';
	}

	function getAvatarUrl(discordId: string, avatar: string | null): string | null {
		if (!avatar || !discordId) return null;
		return `${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordId}/${avatar}.png?size=128`;
	}

	function formatTimeAgo(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months}mo ago`;
		const years = Math.floor(months / 12);
		return `${years}y ago`;
	}

	// Check permissions
	let isOwner = $derived(group?.memberRole === 'owner');
	let isAdmin = $derived(group?.memberRole === 'admin' || isOwner);
	let canEdit = $derived(isOwner || isAdmin);
	let canInvite = $derived(isOwner || isAdmin);

	// Edit handlers
	function startEditing() {
		if (!group) return;
		editName = group.name;
		editDescription = group.description || '';
		editTags = group.tags || [];
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		if (group) {
			editName = group.name;
			editDescription = group.description || '';
			editTags = group.tags || [];
		}
		tagInput = '';
	}

	async function saveChanges() {
		if (!editName.trim()) {
			appCtx.addNotification('Group name is required', 'error');
			return;
		}

		try {
			await updateGroup({
				groupId,
				name: editName.trim(),
				description: editDescription.trim() || undefined,
				tags: editTags.length > 0 ? editTags : undefined
			});

			appCtx.addNotification('Group updated!', 'success', '✓');
			isEditing = false;

			// Refresh groups list
			appCtx.isSyncingGroups = true;
		} catch (error) {
			console.error('[Group Detail] Error updating group:', error);
			appCtx.addNotification('Failed to update group', 'error');
		}
	}

	// Tag handlers
	function addTag() {
		const tag = tagInput.trim();
		if (tag && !editTags.includes(tag)) {
			editTags = [...editTags, tag];
			tagInput = '';
		}
	}

	function removeTag(tag: string) {
		editTags = editTags.filter(t => t !== tag);
	}

	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addTag();
		}
	}

	// Leave group
	async function confirmLeave() {
		try {
			const success = await leaveGroup(groupId);
			if (success) {
				appCtx.addNotification('Left group', 'info');
				goto('/groups');
			} else {
				appCtx.addNotification('Failed to leave group', 'error');
			}
		} catch (error) {
			console.error('[Group Detail] Error leaving group:', error);
			appCtx.addNotification('Error leaving group', 'error');
		}
	}

	// Invite friends
	function openInviteModal() {
		showInviteModal = true;
		selectedFriends = [];
		inviteError = '';
		inviteSuccess = '';
	}

	async function inviteFriends() {
		if (selectedFriends.length === 0) {
			inviteError = 'Please select at least one friend';
			return;
		}

		isSendingInvites = true;
		inviteError = '';

		try {
			await Promise.all(
				selectedFriends.map(friendId =>
					inviteFriendToGroup({ groupId, friendId })
				)
			);

			inviteSuccess = `${selectedFriends.length} invitation${selectedFriends.length > 1 ? 's' : ''} sent!`;
			selectedFriends = [];

			setTimeout(() => {
				showInviteModal = false;
				inviteSuccess = '';
			}, 2000);
		} catch (error) {
			console.error('[Group Detail] Error inviting friends:', error);
			inviteError = 'Failed to send invitations';
		} finally {
			isSendingInvites = false;
		}
	}

	// Remove member
	function openRemoveMemberDialog(member: any) {
		memberToRemove = member;
		showRemoveMemberConfirm = true;
	}

	async function confirmRemoveMember() {
		if (!memberToRemove) return;

		isRemoving = true;
		try {
			const success = await removeMemberFromGroup({
				groupId,
				memberId: memberToRemove.id
			});

			if (success) {
				appCtx.addNotification('Member removed', 'info');
				showRemoveMemberConfirm = false;
				memberToRemove = null;
				await loadMembers();
			} else {
				appCtx.addNotification('Failed to remove member', 'error');
			}
		} catch (error) {
			console.error('[Group Detail] Error removing member:', error);
			appCtx.addNotification('Error removing member', 'error');
		} finally {
			isRemoving = false;
		}
	}

	// Get available friends (not already members)
	let availableFriends = $derived(
		appCtx.apiFriends.filter(friend =>
			!members.some(member => member.userId === friend.friendUserId)
		)
	);
</script>

<div class="flex h-full overflow-hidden">
	<SubNav />
	<div class="flex-1 overflow-y-auto scrollbar-custom">
		<div class="p-6">
			<div class="max-w-6xl mx-auto">
				<!-- Back button -->
				<a
					href="/groups"
					class="inline-flex items-center gap-2 text-muted hover:text-white transition-colors mb-6"
				>
					<span class="text-xl">←</span>
					<span>Back to Groups</span>
				</a>

				{#if !group && !isLoading}
					<div class="p-8 bg-overlay-card rounded-lg border border-panel text-center">
						<p class="text-muted">Group not found or you are not a member of this group.</p>
						<a href="/groups" class="inline-block mt-4 px-4 py-2 btn-white-overlay text-white rounded-lg border">
							Back to Groups
						</a>
					</div>
				{:else if isLoading && !group}
					<div class="p-8 bg-overlay-card rounded-lg border border-panel text-center">
						<p class="text-muted">Loading group...</p>
					</div>
				{:else if group}
					<!-- Group header -->
					<div class="bg-secondary rounded-lg border border-panel p-6 mb-6">
						{#if isEditing}
							<!-- Edit form -->
							<div class="space-y-4">
								<div>
									<label for="name" class="block text-sm font-medium text-muted mb-2">
										Group Name
									</label>
									<input
										type="text"
										id="name"
										bind:value={editName}
										maxlength="50"
										class="w-full px-4 py-2 bg-overlay-light border border-panel rounded-lg text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
									<p class="mt-1 text-xs text-subtle">{editName.length}/50 characters</p>
								</div>

								<div>
									<label for="description" class="block text-sm font-medium text-muted mb-2">
										Description
									</label>
									<textarea
										id="description"
										bind:value={editDescription}
										rows="3"
										maxlength="200"
										class="w-full px-4 py-2 bg-overlay-light border border-panel rounded-lg text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
									></textarea>
								</div>

								<div>
									<label for="tagInput" class="block text-sm font-medium text-muted mb-2">
										Tags
									</label>
									<div class="flex gap-2 mb-2">
										<input
											type="text"
											id="tagInput"
											bind:value={tagInput}
											onkeydown={handleTagKeydown}
											maxlength="30"
											class="flex-1 px-4 py-2 bg-overlay-light border border-panel rounded-lg text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
											placeholder="Add a tag"
										/>
										<button
											type="button"
											onclick={addTag}
											class="px-4 py-2 btn-white-overlay text-white rounded-lg border"
										>
											Add
										</button>
									</div>
									{#if editTags.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each editTags as tag}
												<span class="inline-flex items-center gap-1 px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm border border-blue-600/30">
													{tag}
													<button
														type="button"
														onclick={() => removeTag(tag)}
														class="hover:text-blue-300 transition-colors"
													>
														<span class="text-xs">✕</span>
													</button>
												</span>
											{/each}
										</div>
									{/if}
								</div>

								<div class="flex gap-3">
									<button
										onclick={saveChanges}
										class="px-4 py-2 btn-success text-white rounded-lg border"
									>
										<span class="text-lg">💾</span>
										<span>Save Changes</span>
									</button>
									<button
										onclick={cancelEditing}
										class="px-4 py-2 btn-white-overlay text-white rounded-lg border"
									>
										<span class="text-lg">✕</span>
										<span>Cancel</span>
									</button>
								</div>
							</div>
						{:else}
							<!-- View mode -->
							<div class="flex items-start justify-between">
								<div class="flex items-start gap-4 flex-1 min-w-0">
									{#if group.avatar}
										<img
											src={group.avatar}
											alt={group.name}
											class="w-16 h-16 rounded-lg object-cover flex-shrink-0"
										/>
									{:else}
										<div class="p-3 bg-blue-600/20 rounded-lg flex-shrink-0">
											<span class="text-4xl">🗂️</span>
										</div>
									{/if}
									<div class="flex-1 min-w-0">
										<h1 class="text-3xl font-bold text-white mb-2">{group.name}</h1>
										{#if group.description}
											<p class="text-muted mb-4">{group.description}</p>
										{/if}
										{#if group.tags && group.tags.length > 0}
											<div class="flex flex-wrap gap-2 mb-4">
												{#each group.tags as tag}
													<span class="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm border border-blue-600/30">
														{tag}
													</span>
												{/each}
											</div>
										{/if}
										<div class="flex items-center gap-4 text-sm text-muted">
											<span class="capitalize">{group.memberRole}</span>
											<span>•</span>
											<span>{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}</span>
											<span>•</span>
											<span class="text-xs">{formatTimeAgo(group.createdAt)}</span>
										</div>
									</div>
								</div>

								<div class="flex gap-2 flex-shrink-0">
									{#if canEdit}
										<button
											onclick={startEditing}
											class="px-4 py-2 btn-white-overlay text-white rounded-lg border"
										>
											<span class="text-lg">✏️</span>
											<span>Edit</span>
										</button>
									{/if}
									{#if !isOwner}
										<button
											onclick={() => (showLeaveConfirm = true)}
											class="px-4 py-2 btn-white-overlay text-white rounded-lg border"
										>
											<span class="text-lg">🚪</span>
											<span>Leave</span>
										</button>
									{/if}
								</div>
							</div>
						{/if}
					</div>

					<!-- Members section -->
					<div class="bg-secondary rounded-lg border border-panel p-6">
						<div class="flex items-center justify-between mb-6">
							<h2 class="text-2xl font-bold text-white">Members</h2>
							{#if canInvite}
								<button
									onclick={openInviteModal}
									class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border"
								>
									<span class="text-lg">➕</span>
									<span>Invite Friends</span>
								</button>
							{/if}
						</div>

						{#if isLoading}
							<div class="text-center py-8">
								<p class="text-muted">Loading members...</p>
							</div>
						{:else if members.length === 0}
							<div class="text-center py-8">
								<p class="text-muted">No members found</p>
							</div>
						{:else}
							<div class="space-y-3">
								{#each members as member}
									<div class="flex items-center justify-between p-4 bg-overlay-card rounded-lg border border-panel-light">
										<div class="flex items-center gap-4">
											{#if getAvatarUrl(member.discordId, member.avatar)}
												<img
													src={getAvatarUrl(member.discordId, member.avatar)}
													alt={getDisplayName(member)}
													class="w-10 h-10 rounded-full"
												/>
											{:else}
												<div class="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
													<span class="text-blue-400 font-semibold">
														{getDisplayName(member).charAt(0).toUpperCase()}
													</span>
												</div>
											{/if}
											<div>
												<p class="text-white font-medium">{getDisplayName(member)}</p>
												{#if member.player && !member.usePlayerAsDisplayName}
													<p class="text-sm text-muted">{member.player}</p>
												{/if}
											</div>
										</div>
										<div class="flex items-center gap-4">
											<span class="text-sm text-muted capitalize">{member.role}</span>
											{#if isAdmin && member.role !== 'owner' && member.userId !== appCtx.discordUserId}
												<button
													onclick={() => openRemoveMemberDialog(member)}
													class="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
													title="Remove member"
												>
													<span class="text-base">✕</span>
												</button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Leave Confirmation Modal -->
{#if showLeaveConfirm}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-secondary rounded-lg border border-panel p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Leave Group</h3>
			<p class="text-muted mb-6">
				Are you sure you want to leave this group? You will need to be invited again to rejoin.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showLeaveConfirm = false)}
					class="flex-1 px-4 py-2 btn-white-overlay text-white rounded-lg border"
				>
					Cancel
				</button>
				<button
					onclick={confirmLeave}
					class="flex-1 px-4 py-2 btn-danger text-white rounded-lg border"
				>
					Leave Group
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Invite Friends Modal -->
{#if showInviteModal}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-secondary rounded-lg border border-panel p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Invite Friends to Group</h3>

			{#if availableFriends.length === 0}
				<p class="text-muted mb-6">All your friends are already members of this group.</p>
			{:else}
				<div class="mb-4 max-h-60 overflow-y-auto space-y-2 scrollbar-custom">
					{#each availableFriends as friend}
						<label class="flex items-center gap-3 p-3 rounded-lg cursor-pointer {selectedFriends.includes(friend.friendUserId) ? 'bg-blue-600/20 border border-blue-600' : 'bg-overlay-card hover:bg-overlay-light border border-transparent'}">
							<input
								type="checkbox"
								checked={selectedFriends.includes(friend.friendUserId)}
								onchange={(e) => {
									const target = e.target as HTMLInputElement;
									if (target.checked) {
										selectedFriends = [...selectedFriends, friend.friendUserId];
									} else {
										selectedFriends = selectedFriends.filter(id => id !== friend.friendUserId);
									}
								}}
								class="w-4 h-4 rounded border-panel bg-overlay-light text-blue-600"
							/>
							<span class="text-white">{friend.friendDisplayName}</span>
						</label>
					{/each}
				</div>

				{#if inviteError}
					<div class="mb-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
						<p class="text-red-400 text-sm">{inviteError}</p>
					</div>
				{/if}

				{#if inviteSuccess}
					<div class="mb-4 p-3 bg-green-900/20 border border-green-800 rounded-lg">
						<p class="text-green-400 text-sm">{inviteSuccess}</p>
					</div>
				{/if}
			{/if}

			<div class="flex gap-3">
				<button
					onclick={() => (showInviteModal = false)}
					disabled={isSendingInvites}
					class="flex-1 px-4 py-2 btn-white-overlay text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
				{#if availableFriends.length > 0}
					<button
						onclick={inviteFriends}
						disabled={selectedFriends.length === 0 || isSendingInvites}
						class="flex-1 px-4 py-2 btn-success text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSendingInvites ? 'Sending...' : `Invite (${selectedFriends.length})`}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Remove Member Confirmation Modal -->
{#if showRemoveMemberConfirm && memberToRemove}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-secondary rounded-lg border border-panel p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Remove Member</h3>
			<p class="text-muted mb-6">
				Are you sure you want to remove <span class="font-semibold text-white">{getDisplayName(memberToRemove)}</span> from this group?
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => {
						showRemoveMemberConfirm = false;
						memberToRemove = null;
					}}
					disabled={isRemoving}
					class="flex-1 px-4 py-2 btn-white-overlay text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Cancel
				</button>
				<button
					onclick={confirmRemoveMember}
					disabled={isRemoving}
					class="flex-1 px-4 py-2 btn-danger text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isRemoving ? 'Removing...' : 'Remove Member'}
				</button>
			</div>
		</div>
	</div>
{/if}
