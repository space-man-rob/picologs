<script lang="ts">
	import { getAppContext } from '$lib/appContext.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		fetchGroupMembers,
		updateGroup,
		leaveGroup,
		deleteGroup,
		inviteFriendToGroup,
		removeMemberFromGroup,
		uploadAvatar,
		type ApiGroupMember
	} from '$lib/api';
	import { Plus, Pencil, LogOut, X, Save, Trash2, Loader2 } from '@lucide/svelte';
	import SubNav from '../../../components/SubNav.svelte';
	import { Avatar } from '@space-man-rob/shared-svelte';

	const appCtx = getAppContext();

	// Get group ID from URL params
	let groupId = $derived($page.params.id);

	// Find group in cached data
	let group = $derived.by(() => {
		const foundGroup = appCtx.groups.find((g) => g.id === groupId);
		return foundGroup;
	});

	// State
	let members = $state<ApiGroupMember[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let showLeaveConfirm = $state(false);
	let showDeleteConfirm = $state(false);
	let showInviteModal = $state(false);
	let showRemoveMemberConfirm = $state(false);

	// Edit form state
	let editName = $state('');
	let editDescription = $state('');
	let editAvatar = $state('');
	let editTags = $state<string[]>([]);
	let tagInput = $state('');
	let avatarFile = $state<File | null>(null);
	let avatarPreview = $state<string>('');
	let isUploading = $state(false);
	let uploadError = $state('');

	// Modal state
	let memberToRemove = $state<ApiGroupMember | null>(null);
	let isRemoving = $state(false);
	let selectedFriends = $state<string[]>([]);
	let isSendingInvites = $state(false);
	let inviteError = $state('');
	let inviteSuccess = $state('');

	// Load members when component mounts or groupId changes
	$effect(() => {
		// Only load members if user is signed in and WebSocket is connected
		if (groupId && appCtx.isSignedIn && appCtx.connectionStatus === 'connected') {
			loadMembers();
		} else if (groupId && (!appCtx.isSignedIn || appCtx.connectionStatus !== 'connected')) {
			isLoading = false;
		}
	});

	async function loadMembers() {
		if (!groupId) {
			isLoading = false;
			return;
		}

		if (!group) {
			isLoading = false;
			return;
		}

		// Double-check connection status before making request
		if (!appCtx.isSignedIn || appCtx.connectionStatus !== 'connected') {
			isLoading = false;
			return;
		}

		isLoading = true;
		try {
			const membersList = await fetchGroupMembers(groupId);
			members = membersList;
		} catch (error) {
			// Don't show error notification - group might just be loading
			// appCtx.addNotification('Error loading group members', 'error');
		} finally {
			isLoading = false;
		}
	}

	// Helper functions
	function getDisplayName(member: ApiGroupMember): string {
		if (member.usePlayerAsDisplayName && member.player) {
			return member.player;
		}
		return member.username || 'Unknown';
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
		editAvatar = group.avatar || '';
		editTags = group.tags || [];
		avatarPreview = group.avatar || '';
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
		if (group) {
			editName = group.name;
			editDescription = group.description || '';
			editAvatar = group.avatar || '';
			editTags = group.tags || [];
		}
		tagInput = '';
		avatarFile = null;
		avatarPreview = group?.avatar || '';
		uploadError = '';
	}

	async function saveChanges() {
		if (!editName.trim()) {
			appCtx.addNotification('Group name is required', 'error');
			return;
		}

		if (!groupId) {
			appCtx.addNotification('Group ID is missing', 'error');
			return;
		}

		try {
			let avatarUrl = editAvatar;

			// Upload avatar if a new file was selected
			if (avatarFile) {
				isUploading = true;
				uploadError = '';

				try {
					avatarUrl = await uploadAvatar(avatarFile);
				} catch (error) {
					uploadError = error instanceof Error ? error.message : 'Failed to upload avatar';
					isUploading = false;
					return;
				}

				isUploading = false;
			}

			// Update group with all changes including avatar
			await updateGroup({
				groupId,
				name: editName.trim(),
				description: editDescription.trim() || undefined,
				avatar: avatarUrl || undefined,
				tags: editTags.length > 0 ? editTags : undefined
			});

			appCtx.addNotification('Group updated!', 'success', '✓');
			isEditing = false;
			avatarFile = null;

			// Refresh groups list
			appCtx.isSyncingGroups = true;
		} catch (error) {
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
		editTags = editTags.filter((t) => t !== tag);
	}

	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addTag();
		}
	}

	// Avatar handlers
	function handleFileChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			if (!file.type.startsWith('image/')) {
				uploadError = 'Please select an image file';
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				uploadError = 'Image must be less than 5MB';
				return;
			}

			avatarFile = file;
			uploadError = '';

			// Create preview
			const reader = new FileReader();
			reader.onload = (e) => {
				avatarPreview = e.target?.result as string;
			};
			reader.readAsDataURL(file);
		}
	}

	function clearAvatar() {
		avatarFile = null;
		avatarPreview = '';
		editAvatar = '';
		uploadError = '';
	}

	// Leave group
	async function confirmLeave() {
		if (!groupId) {
			appCtx.addNotification('Group ID is missing', 'error');
			return;
		}

		try {
			const success = await leaveGroup(groupId);
			if (success) {
				appCtx.addNotification('Left group', 'info');
				goto('/groups');
			} else {
				appCtx.addNotification('Failed to leave group', 'error');
			}
		} catch (error) {
			appCtx.addNotification('Error leaving group', 'error');
		}
	}

	// Delete group
	async function confirmDelete() {
		if (!groupId) {
			appCtx.addNotification('Group ID is missing', 'error');
			return;
		}

		try {
			const success = await deleteGroup(groupId);
			if (success) {
				appCtx.addNotification('Group deleted', 'info');
				goto('/groups');
			} else {
				appCtx.addNotification('Failed to delete group', 'error');
			}
		} catch (error) {
			appCtx.addNotification('Error deleting group', 'error');
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

		if (!groupId) {
			inviteError = 'Group ID is missing';
			return;
		}

		isSendingInvites = true;
		inviteError = '';

		try {
			await Promise.all(
				selectedFriends.map((friendId) => inviteFriendToGroup({ groupId, friendId }))
			);

			inviteSuccess = `${selectedFriends.length} invitation${selectedFriends.length > 1 ? 's' : ''} sent!`;
			selectedFriends = [];

			setTimeout(() => {
				showInviteModal = false;
				inviteSuccess = '';
			}, 2000);
		} catch (error) {
			inviteError = 'Failed to send invitations';
		} finally {
			isSendingInvites = false;
		}
	}

	// Remove member
	function openRemoveMemberDialog(member: ApiGroupMember) {
		memberToRemove = member;
		showRemoveMemberConfirm = true;
	}

	async function confirmRemoveMember() {
		if (!memberToRemove) return;

		if (!groupId) {
			appCtx.addNotification('Group ID is missing', 'error');
			return;
		}

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
			appCtx.addNotification('Error removing member', 'error');
		} finally {
			isRemoving = false;
		}
	}

	// Get available friends (not already members)
	let availableFriends = $derived(
		appCtx.apiFriends.filter(
			(friend) => !members.some((member) => member.userId === friend.friendUserId)
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
						<a
							href="/groups"
							class="inline-block mt-4 px-4 py-2 btn-white-overlay text-white rounded-lg border"
						>
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
									<span class="block text-sm font-medium text-muted mb-2">Group Avatar</span>
									{#if avatarPreview}
										<div class="mb-4">
											<div class="relative inline-block">
												<img
													src={avatarPreview}
													alt="Avatar preview"
													class="w-32 h-32 rounded-lg object-cover border border-panel"
												/>
												<button
													type="button"
													onclick={clearAvatar}
													class="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors shadow-lg"
												>
													<X size={14} />
												</button>
											</div>
										</div>
									{:else}
										<label
											for="group-avatar-edit"
											class="flex flex-col items-center justify-center w-full h-32 border-2 border-panel border-dashed rounded-lg cursor-pointer bg-overlay-light hover:bg-overlay-card transition-colors"
										>
											<div class="flex flex-col items-center justify-center pt-5 pb-6">
												<span class="text-3xl mb-2">📤</span>
												<p class="text-sm text-muted">Click to upload image</p>
												<p class="text-xs text-subtle">PNG, JPG, GIF up to 5MB</p>
											</div>
											<input
												id="group-avatar-edit"
												type="file"
												accept="image/*"
												onchange={handleFileChange}
												class="hidden"
											/>
										</label>
									{/if}
									{#if uploadError}
										<p class="mt-1 text-sm text-red-400">{uploadError}</p>
									{/if}
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
											{#each editTags as tag (tag)}
												<span
													class="inline-flex items-center gap-1 px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm border border-blue-600/30"
												>
													{tag}
													<button
														type="button"
														onclick={() => removeTag(tag)}
														class="hover:text-blue-300 transition-colors"
													>
														<X size={12} />
													</button>
												</span>
											{/each}
										</div>
									{/if}
								</div>

								<div class="flex gap-3">
									<button
										onclick={saveChanges}
										disabled={isUploading}
										class="flex items-center gap-2 px-4 py-2 btn-success text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{#if isUploading}
											<Loader2 size={18} class="animate-spin" />
										{:else}
											<Save size={18} />
										{/if}
										<span>{isUploading ? 'Uploading...' : 'Save Changes'}</span>
									</button>
									<button
										onclick={cancelEditing}
										disabled={isUploading}
										class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<X size={18} />
										<span>Cancel</span>
									</button>
								</div>

								{#if isOwner}
									<div class="mt-8 pt-6 border-t border-panel">
										<h3 class="text-lg font-semibold text-white mb-2">Danger Zone</h3>
										<p class="text-sm text-muted mb-4">
											Once you delete a group, there is no going back. Please be certain.
										</p>
										<button
											onclick={() => (showDeleteConfirm = true)}
											class="flex items-center gap-2 px-4 py-2 btn-danger text-white rounded-lg border"
										>
											<Trash2 size={18} />
											<span>Delete Group</span>
										</button>
									</div>
								{/if}
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
												{#each group.tags as tag (tag)}
													<span
														class="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm border border-blue-600/30"
													>
														{tag}
													</span>
												{/each}
											</div>
										{/if}
										<div class="flex items-center gap-4 text-sm text-muted">
											<span class="capitalize">{group.memberRole}</span>
											<span>•</span>
											<span
												>{group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}</span
											>
											<span>•</span>
											<span class="text-xs">{formatTimeAgo(group.createdAt)}</span>
										</div>
									</div>
								</div>

								<div class="flex gap-2 flex-shrink-0">
									{#if canEdit}
										<button
											onclick={startEditing}
											class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border"
										>
											<Pencil size={16} />
											<span>Edit</span>
										</button>
									{/if}
									{#if !isOwner}
										<button
											onclick={() => (showLeaveConfirm = true)}
											class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border"
										>
											<LogOut size={16} />
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
									<Plus size={18} />
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
								{#each members as member (member.userId)}
									<div
										class="flex items-center justify-between p-4 bg-overlay-card rounded-lg border border-panel-light"
									>
										<div class="flex items-center gap-4">
											<Avatar
												avatar={member.avatar}
												discordId={member.discordId}
												userId={member.userId}
												alt={getDisplayName(member)}
												size={10}
											/>
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
													<X size={16} />
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

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
		<div class="bg-secondary rounded-lg border border-panel p-6 max-w-md w-full">
			<h3 class="text-xl font-bold text-white mb-4">Delete Group</h3>
			<p class="text-muted mb-6">
				Are you sure you want to delete this group? This action cannot be undone and all group
				data will be permanently removed.
			</p>
			<div class="flex gap-3">
				<button
					onclick={() => (showDeleteConfirm = false)}
					class="flex-1 px-4 py-2 btn-white-overlay text-white rounded-lg border"
				>
					Cancel
				</button>
				<button
					onclick={confirmDelete}
					class="flex-1 px-4 py-2 btn-danger text-white rounded-lg border"
				>
					Delete Group
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
					{#each availableFriends as friend (friend.friendUserId)}
						<label
							class="flex items-center gap-3 p-3 rounded-lg cursor-pointer {selectedFriends.includes(
								friend.friendUserId
							)
								? 'bg-blue-600/20 border border-blue-600'
								: 'bg-overlay-card hover:bg-overlay-light border border-transparent'}"
						>
							<input
								type="checkbox"
								checked={selectedFriends.includes(friend.friendUserId)}
								onchange={(e) => {
									const target = e.target as HTMLInputElement;
									if (target.checked) {
										selectedFriends = [...selectedFriends, friend.friendUserId];
									} else {
										selectedFriends = selectedFriends.filter((id) => id !== friend.friendUserId);
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
				Are you sure you want to remove <span class="font-semibold text-white"
					>{getDisplayName(memberToRemove)}</span
				> from this group?
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
