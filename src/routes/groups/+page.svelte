<script lang="ts">
	import { getAppContext } from '$lib/appContext.svelte';
	import { acceptGroupInvitation, denyGroupInvitation } from '$lib/api';
	import type { GroupInvitation, Group } from '../../types';
	import Skeleton from '../../components/Skeleton.svelte';
	import SubNav from '../../components/SubNav.svelte';

	const appCtx = getAppContext();

	// Format time ago (simplified version without date-fns)
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

	async function handleAcceptInvitation(invitation: GroupInvitation) {
		appCtx.processingGroupInvitations.add(invitation.id);
		appCtx.processingGroupInvitations = appCtx.processingGroupInvitations;

		try {
			const result = await acceptGroupInvitation(invitation.id);
			if (result) {
				appCtx.addNotification(
					`Joined ${invitation.group.name}`,
					'success',
					'✓'
				);
				// Remove invitation from list
				appCtx.groupInvitations = appCtx.groupInvitations.filter(
					(inv) => inv.id !== invitation.id
				);
				// Force refetch groups to get updated list
				appCtx.isSyncingGroups = true;
			}
		} catch (error) {
			console.error('[Groups] Error accepting invitation:', error);
			appCtx.addNotification(
				`Failed to join ${invitation.group.name}`,
				'error'
			);
		} finally {
			appCtx.processingGroupInvitations.delete(invitation.id);
			appCtx.processingGroupInvitations = appCtx.processingGroupInvitations;
		}
	}

	async function handleDenyInvitation(invitation: GroupInvitation) {
		appCtx.processingGroupInvitations.add(invitation.id);
		appCtx.processingGroupInvitations = appCtx.processingGroupInvitations;

		try {
			const success = await denyGroupInvitation(invitation.id);
			if (success) {
				appCtx.addNotification(
					`Declined invitation to ${invitation.group.name}`,
					'info'
				);
				// Remove invitation from list
				appCtx.groupInvitations = appCtx.groupInvitations.filter(
					(inv) => inv.id !== invitation.id
				);
			}
		} catch (error) {
			console.error('[Groups] Error denying invitation:', error);
			appCtx.addNotification(
				`Failed to decline invitation`,
				'error'
			);
		} finally {
			appCtx.processingGroupInvitations.delete(invitation.id);
			appCtx.processingGroupInvitations = appCtx.processingGroupInvitations;
		}
	}

	function handleCreateGroup() {
		appCtx.addNotification(
			'Group creation coming soon!',
			'info',
			'🚧'
		);
	}

	// Derived values
	let sortedGroups = $derived(
		[...appCtx.groups].sort((a, b) => a.name.localeCompare(b.name))
	);

	let pendingInvitations = $derived(
		appCtx.groupInvitations.filter((inv) => inv.status === 'pending')
	);
</script>

<div class="flex h-full overflow-hidden">
	<SubNav />
	<div class="flex-1 overflow-y-auto scrollbar-custom">
		<div class="p-6">
		<div class="max-w-6xl mx-auto">
			<!-- Header -->
			<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
				<div>
					<h1 class="text-2xl font-bold text-white mb-2">Groups</h1>
					<p class="text-muted">View and manage your groups</p>
				</div>
				<button
					onclick={handleCreateGroup}
					class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border transition-colors duration-200 w-full sm:w-auto justify-center flex-shrink-0"
				>
					<span class="text-lg">➕</span>
					<span>Create Group</span>
				</button>
			</div>

			<!-- Pending Invitations -->
			{#if pendingInvitations.length > 0}
				<div class="rounded-lg border border-panel p-6 mb-8 bg-secondary">
					<h2 class="text-xl font-bold text-white mb-4">Pending Group Invitations</h2>
					<div class="space-y-4">
						{#each pendingInvitations as invitation (invitation.id)}
							<div
								class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-overlay-card rounded-lg border border-panel-light"
							>
								<div class="flex items-center gap-4 w-full sm:w-auto min-w-0">
									{#if invitation.group.avatar}
										<img
											src={invitation.group.avatar}
											alt={invitation.group.name}
											class="w-12 h-12 rounded-lg object-cover flex-shrink-0"
										/>
									{:else}
										<div class="p-3 bg-blue-600/20 rounded-lg flex-shrink-0">
											<span class="text-2xl">🗂️</span>
										</div>
									{/if}
									<div class="flex-1 min-w-0">
										<h3 class="text-base text-white font-semibold truncate">
											{invitation.group.name}
										</h3>
										{#if invitation.group.description}
											<p class="text-sm text-muted truncate">
												{invitation.group.description}
											</p>
										{/if}
										<div class="flex items-center gap-2 mt-1 text-xs text-subtle">
											<span>Invited by {invitation.inviter.username}</span>
											<span>•</span>
											<span>{formatTimeAgo(invitation.createdAt)}</span>
										</div>
									</div>
								</div>
								<div class="flex gap-2 w-full sm:w-auto">
									<button
										onclick={() => handleAcceptInvitation(invitation)}
										disabled={appCtx.processingGroupInvitations.has(invitation.id)}
										class="btn-success flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border"
									>
										{#if appCtx.processingGroupInvitations.has(invitation.id)}
											<span class="inline-block animate-spin text-lg">⏳</span>
										{:else}
											<span class="text-lg">✓</span>
										{/if}
										<span>Accept</span>
									</button>
									<button
										onclick={() => handleDenyInvitation(invitation)}
										disabled={appCtx.processingGroupInvitations.has(invitation.id)}
										class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 btn-white-overlay text-white text-sm rounded-lg border transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
									>
										{#if appCtx.processingGroupInvitations.has(invitation.id)}
											<span class="inline-block animate-spin text-lg">⏳</span>
										{:else}
											<span class="text-lg">✕</span>
										{/if}
										<span>Deny</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Groups List -->
			{#if appCtx.isLoadingGroups && appCtx.groups.length === 0}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					<Skeleton count={6} />
				</div>
			{:else if appCtx.groups.length === 0}
				<div
					class="flex flex-col items-center justify-center py-16 px-4 rounded-lg border border-panel bg-secondary"
				>
					<span class="text-5xl text-subtle mb-4">🗂️</span>
					<h2 class="text-xl font-semibold text-white mb-2">No groups yet</h2>
					<p class="text-muted text-center mb-6">
						Create your first group to start collaborating with others
					</p>
					<button
						onclick={handleCreateGroup}
						class="flex items-center gap-2 px-4 py-2 btn-white-overlay text-white rounded-lg border transition-colors duration-200"
					>
						<span class="text-xl">➕</span>
						<span>Create Group</span>
					</button>
				</div>
			{:else}
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each sortedGroups as group (group.id)}
						<div
							class="block p-6 rounded-lg border border-panel transition-all hover:brightness-110 cursor-pointer bg-secondary"
						>
							<div class="flex items-start justify-between mb-4">
								<div class="flex items-center gap-3">
									{#if group.avatar && (group.avatar.startsWith('http') || group.avatar.startsWith('/uploads'))}
										<img
											src={group.avatar}
											alt={group.name}
											class="w-12 h-12 rounded-lg object-cover"
										/>
									{:else}
										<div class="p-2 bg-blue-600/20 rounded-lg">
											<span class="text-2xl">{group.avatar || '🗂️'}</span>
										</div>
									{/if}
									<div>
										<h3 class="text-lg font-semibold text-white">{group.name}</h3>
										<p class="text-sm text-muted capitalize">{group.memberRole}</p>
									</div>
								</div>
							</div>
							{#if group.description}
								<p class="text-white/90 mb-4 line-clamp-2">{group.description}</p>
							{/if}
							{#if group.tags && group.tags.length > 0}
								<div class="flex items-center gap-2 mb-4 flex-wrap">
									{#each group.tags as tag}
										<span class="text-xs px-2 py-1 rounded bg-overlay-light text-white/60">
											{tag}
										</span>
									{/each}
								</div>
							{/if}
							<div class="flex items-center justify-between text-sm">
								<span class="text-muted">
									{group.memberCount}
									{group.memberCount === 1 ? 'member' : 'members'}
								</span>
								<span class="text-subtle">
									{formatTimeAgo(group.createdAt)}
								</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
