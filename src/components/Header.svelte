<script lang="ts">
	import { untrack } from 'svelte';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { goto } from '$app/navigation';
	import { getDiscordColor } from '$lib/discord-colors';

	// Check if avatar is a valid Discord avatar hash (not just a default avatar index)
	function isValidAvatarHash(avatar: string | null | undefined): boolean {
		if (!avatar) return false;
		// Discord avatar hashes are alphanumeric strings (usually 32 chars)
		// Default avatars are just single digits (0-5), which are not valid custom avatars
		const cleanAvatar = avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '');
		return cleanAvatar.length > 2 && /^[a-zA-Z0-9_]+$/.test(cleanAvatar);
	}

	let {
		friendCode,
		connectWebSocket,
		connectionStatus,
		copiedStatusVisible = $bindable(),
		selectFile,
		logLocation,
		clearLogs,
		updateInfo,
		installUpdate,
		connectionError,
		isSignedIn,
		discordUser,
		handleSignIn,
		handleSignOut,
		isAuthenticating,
		authError,
		friendRequests = [],
		groupInvitations = [],
		onAcceptFriend,
		onDenyFriend,
		onAcceptInvitation,
		onDenyInvitation,
		processingFriendRequests = new Set(),
		processingGroupInvitations = new Set()
	} = $props();

	async function handleClearLogs() {
		const answer = await ask('This action cannot be reverted. Are you sure?', {
			title: 'Clear Logs',
			kind: 'warning'
		});
		if (answer) {
			clearLogs();
		}
	}

	let logVersionDropdownOpen = $state(false);
	let showProfileDropdown = $state(false);
	let showNotificationsDropdown = $state(false);

	// Calculate notification count
	let notificationCount = $derived(
		(Array.isArray(friendRequests) ? friendRequests : []).filter((r) => r.direction === 'incoming')
			.length + (Array.isArray(groupInvitations) ? groupInvitations : []).length
	);

	async function selectVersion(option: 'Select new') {
		logVersionDropdownOpen = false;

		if (option === 'Select new') {
			selectFile();
			return;
		}
	}

	function toggleLogVersionDropdown() {
		logVersionDropdownOpen = !logVersionDropdownOpen;
	}

	function handleOpenProfile() {
		goto('/profile');
	}

	function handleOpenFriends() {
		goto('/friends');
	}

	function handleOpenGroups() {
		goto('/groups');
	}

	// Format relative time (e.g., "2m ago", "3h ago", "5d ago")
	function formatRelativeTime(timestamp: string): string {
		const now = Date.now();
		const then = new Date(timestamp).getTime();
		const diffMs = now - then;
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;
		if (diffDays < 30) return `${diffDays}d ago`;
		return new Date(timestamp).toLocaleDateString();
	}

	// Show dialog when connection error occurs
	let showConnectionDialog = $state(false);
	let lastConnectionError = $state<string | null>(null);
	let showReconnectButton = $state(false);

	// NOT reactive - just stores the timer ID
	let errorDialogTimer: number | null = null;

	$effect(() => {
		// Show dialog only when error changes (new error occurred) and user is signed in
		if (connectionError && connectionError !== lastConnectionError && isSignedIn && discordUser) {
			// Clear any existing timer
			if (errorDialogTimer) {
				clearTimeout(errorDialogTimer);
			}

			// Wait 3 seconds before showing the dialog (gives time for auto-reconnect)
			errorDialogTimer = setTimeout(() => {
				showConnectionDialog = true;
				showReconnectButton = false;
				lastConnectionError = connectionError;
			}, 3000) as unknown as number;
		} else if (!connectionError) {
			// Connection restored - clear timer and hide dialog
			if (errorDialogTimer) {
				clearTimeout(errorDialogTimer);
				errorDialogTimer = null;
			}
			// Use untrack to avoid triggering the effect when updating state
			// This follows Svelte 5 best practices: avoid updating state in effects
			untrack(() => {
				showConnectionDialog = false;
				showReconnectButton = false;
				lastConnectionError = null;
			});
		}
	});

	function handleReconnect() {
		showConnectionDialog = false;
		showReconnectButton = false;
		lastConnectionError = null;
		connectWebSocket();
	}

	function handleDismiss() {
		showConnectionDialog = false;
		showReconnectButton = true;
		// Keep lastConnectionError so we don't show it again for the same error
	}

	// Close dropdowns when clicking outside
	$effect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as HTMLElement;
			if (showNotificationsDropdown && !target.closest('.notifications-dropdown')) {
				showNotificationsDropdown = false;
			}
			if (showProfileDropdown && !target.closest('.profile-dropdown')) {
				showProfileDropdown = false;
			}
			if (logVersionDropdownOpen && !target.closest('.log-version-dropdown')) {
				logVersionDropdownOpen = false;
			}
		}

		if (typeof document !== 'undefined') {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<header
	class="h-[56px] flex justify-between items-center bg-panel border-b border-white/5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-3"
>
	<div class="flex items-center gap-2 flex-shrink-0">
		<img src="/pico.webp" alt="Picologs" class="w-9 h-9" />
		<h1 class="text-xl font-medium m-0 text-white hidden sm:block">Picologs</h1>
	</div>

	<aside class="flex gap-3 items-center flex-wrap justify-end">
		{#if showReconnectButton && isSignedIn && discordUser}
			<button
				class="bg-red-600 text-white px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1.5 hover:bg-red-700 animate-pulse text-sm"
				onclick={handleReconnect}
				title="Connection lost - click to reconnect"
			>
				⚠️ Reconnect
			</button>
		{/if}
		{#if updateInfo}
			<button
				class="bg-green-600 text-white px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1 hover:bg-green-700 text-sm"
				onclick={installUpdate}
			>
				⬇️ <span class="hidden md:inline">Update Available</span>
			</button>
		{/if}
		{#if isSignedIn && discordUser}
			<button
				class="text-white border border-white/5 px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1 hover:bg-white/20 text-sm"
				onclick={() => {
					navigator.clipboard.writeText(friendCode || '');
					copiedStatusVisible = true;
					setTimeout(() => {
						copiedStatusVisible = false;
					}, 1500);
				}}
			>
				{copiedStatusVisible ? '✅' : '📋'}
				<p class="m-0"><span class="hidden lg:inline">Friend Code:</span> {friendCode || 'N/A'}</p>
			</button>
		{/if}
		{#if logLocation}
			<div class="relative log-version-dropdown">
				<button
					class="text-white border border-white/5 px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1 hover:bg-white/20 text-sm"
					onclick={toggleLogVersionDropdown}
					title="Select Game.log file"
				>
					📜
					<span class="hidden md:inline">{logLocation}</span>
					<div
						class="flex items-center justify-center w-3 h-3 transition-transform duration-200 {logVersionDropdownOpen
							? 'rotate-180'
							: ''}"
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<polyline points="6 9 12 15 18 9"></polyline>
						</svg>
					</div>
				</button>
				{#if logVersionDropdownOpen}
					<div
						class="absolute top-full left-0 mt-1 bg-panel border border-white/5 rounded min-w-[120px] shadow-lg z-[1000] overflow-hidden"
					>
						<button
							class="w-full px-3 py-1.5 bg-transparent border-none text-white text-left cursor-pointer text-sm transition-colors duration-150 flex items-center hover:bg-overlay-light"
							onclick={() => selectVersion('Select new')}
						>
							Select new
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="text-white border border-white/5 px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1 hover:bg-white/20 text-sm"
				onclick={() => selectFile()}
				title="Select Game.log file"
			>
				📄 <span class="hidden sm:inline">Select Game.log file</span>
			</button>
		{/if}

		<button
			class="text-white border border-white/5 px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1 hover:bg-white/20 text-sm"
			onclick={handleClearLogs}
			title="Clear all logs"
		>
			🧹 <span class="hidden md:inline">Clear Logs</span>
		</button>

		{#if isSignedIn && discordUser}
			<!-- Notifications Bell -->
			<div class="relative notifications-dropdown">
				<button
					onclick={() => (showNotificationsDropdown = !showNotificationsDropdown)}
					class="relative text-muted hover:text-white transition-colors text-lg"
					title="Notifications"
				>
					🔔
					{#if notificationCount > 0}
						<span
							class="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white"
						>
							{notificationCount}
						</span>
					{/if}
				</button>

				{#if showNotificationsDropdown}
					{@const incomingFriendRequests = (
						Array.isArray(friendRequests) ? friendRequests : []
					).filter((r) => r.direction === 'incoming')}
					<div
						class="absolute right-0 mt-1 w-80 md:w-96 max-w-[calc(100vw-2rem)] bg-panel border border-white/5 rounded-lg shadow-xl z-[1000] max-h-[min(600px,80vh)] overflow-y-auto"
					>
						{#if incomingFriendRequests.length === 0 && groupInvitations.length === 0}
							<div class="p-8 text-center text-muted">
								<div class="text-5xl mx-auto mb-2 opacity-50">🔔</div>
								<p>No pending notifications</p>
							</div>
						{:else}
							<div class="divide-y divide-white/10">
								{#each incomingFriendRequests as request (request.id)}
									<div class="p-4 hover:bg-overlay-light">
										<div class="flex items-start gap-3 mb-3">
											{#if request.avatar && isValidAvatarHash(request.avatar)}
												<img
													src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.discordId}/${request.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=64`}
													alt={request.username}
													class="w-10 h-10 rounded-full flex-shrink-0"
												/>
											{:else}
												<div
													class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
													style="background-color: {getDiscordColor(request.id)}33;"
												>
													<svg width="20" height="20" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
														<path
															d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
															fill="white"
														/>
													</svg>
												</div>
											{/if}
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium text-white">
													{request.username || 'Unknown User'}
												</p>
												{#if request.player}
													<p class="text-xs text-muted">{request.player}</p>
												{/if}
												<p class="text-xs text-subtle mt-1">
													{formatRelativeTime(request.createdAt)}
												</p>
											</div>
										</div>
										<div class="flex gap-2">
											<button
												onclick={() => onAcceptFriend?.(request.id)}
												disabled={processingFriendRequests.has(request.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											>
												{#if processingFriendRequests.has(request.id)}
													Processing...
												{:else}
													Accept
												{/if}
											</button>
											<button
												onclick={() => onDenyFriend?.(request.id)}
												disabled={processingFriendRequests.has(request.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-white text-sm rounded border border-white/5 hover:bg-white/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
											>
												{#if processingFriendRequests.has(request.id)}
													Processing...
												{:else}
													Ignore
												{/if}
											</button>
										</div>
									</div>
								{/each}

								{#each groupInvitations as invitation (invitation.id)}
									<div class="p-4 hover:bg-overlay-light">
										<div class="flex items-start gap-3 mb-3">
											{#if invitation.group?.avatar}
												<img
													src={invitation.group.avatar}
													alt={invitation.group.name}
													class="w-10 h-10 rounded-lg object-cover flex-shrink-0"
												/>
											{:else}
												<div class="p-2 bg-blue-600/20 rounded-lg flex-shrink-0 text-xl">🙏</div>
											{/if}
											<div class="flex-1 min-w-0">
												<p class="text-xs font-semibold text-blue-400 mb-1">Join Group Request</p>
												<p class="text-sm font-medium text-white">
													{invitation.group?.name || 'Unknown Group'}
												</p>
												<p class="text-xs text-muted">
													Invited by {invitation.inviter?.username || 'Unknown User'}
												</p>
												<p class="text-xs text-subtle mt-1">
													{new Date(invitation.createdAt).toLocaleDateString()}
												</p>
											</div>
										</div>
										<div class="flex gap-2">
											<button
												onclick={() => onAcceptInvitation?.(invitation.id)}
												disabled={processingGroupInvitations.has(invitation.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
											>
												{#if processingGroupInvitations.has(invitation.id)}
													<span class="inline-block animate-spin">⏳</span>
												{:else}
													✓
												{/if}
												Accept
											</button>
											<button
												onclick={() => onDenyInvitation?.(invitation.id)}
												disabled={processingGroupInvitations.has(invitation.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-white text-sm rounded border border-white/5 hover:bg-white/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
											>
												{#if processingGroupInvitations.has(invitation.id)}
													<span class="inline-block animate-spin">⏳</span>
												{:else}
													✕
												{/if}
												Deny
											</button>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<div class="relative profile-dropdown">
				<button
					onclick={() => (showProfileDropdown = !showProfileDropdown)}
					class="flex items-center justify-center rounded-full p-0 border-0 bg-transparent cursor-pointer"
					title={connectionError || (connectionStatus === 'connected' ? 'Online' : 'Offline')}
				>
					<div class="relative flex items-center justify-center">
						{#if discordUser.avatar && discordUser.id && isValidAvatarHash(discordUser.avatar)}
							<img
								src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordUser.id}/${discordUser.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=64`}
								alt={discordUser.username}
								class="w-8 h-8 rounded-full border-2 transition-[border-color] duration-300"
								class:border-green-500={connectionStatus === 'connected'}
								class:glow-success={connectionStatus === 'connected'}
								class:border-red-500={connectionStatus === 'disconnected'}
								class:border-orange-500={connectionStatus === 'connecting'}
							/>
						{:else}
							<div
								class="w-8 h-8 rounded-full border-2 flex items-center justify-center transition-[border-color] duration-300"
								style="background-color: {getDiscordColor(discordUser.id || 'default')}33;"
								class:border-green-500={connectionStatus === 'connected'}
								class:glow-success={connectionStatus === 'connected'}
								class:border-red-500={connectionStatus === 'disconnected'}
								class:border-orange-500={connectionStatus === 'connecting'}
							>
								<svg width="16" height="16" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path
										d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
										fill="white"
									/>
								</svg>
							</div>
						{/if}
						{#if connectionStatus === 'connecting'}
							<div class="spinner-small"></div>
						{/if}
					</div>
				</button>

				{#if showProfileDropdown}
					<div
						class="absolute right-0 mt-1 w-64 bg-panel border border-white/5 rounded-lg shadow-xl z-[1000]"
					>
						<!-- Profile Info -->
						<div class="p-4 border-b border-white/5">
							<div class="flex items-center gap-3 mb-3">
								{#if discordUser.avatar && discordUser.id && isValidAvatarHash(discordUser.avatar)}
									<img
										src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordUser.id}/${discordUser.avatar.replace(/\.(png|jpg|jpeg|gif|webp)$/i, '')}.png?size=64`}
										alt={discordUser.username}
										class="w-12 h-12 rounded-full"
									/>
								{:else}
									<div
										class="w-12 h-12 rounded-full flex items-center justify-center"
										style="background-color: {getDiscordColor(discordUser.id || 'default')}33;"
									>
										<svg width="24" height="24" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
											<path
												d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z"
												fill="white"
											/>
										</svg>
									</div>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="text-sm font-semibold text-white truncate">
										{discordUser.username || 'User'}
									</p>
									<p
										class="text-xs font-normal truncate"
										class:text-green-500={connectionStatus === 'connected'}
										class:text-red-500={connectionStatus !== 'connected'}
									>
										{connectionStatus === 'connected' ? 'Online' : 'Offline'}
									</p>
								</div>
							</div>

							{#if friendCode}
								<button
									onclick={() => {
										navigator.clipboard.writeText(friendCode || '');
										copiedStatusVisible = true;
										setTimeout(() => {
											copiedStatusVisible = false;
										}, 1500);
									}}
									class="w-full flex items-center justify-between gap-2 px-3 py-2 bg-overlay-light rounded text-xs hover:bg-overlay-light transition-colors group"
								>
									<span class="text-muted">Friend Code</span>
									<div class="flex items-center gap-2">
										<span class="font-mono text-white">{friendCode}</span>
										<span class="text-xs">📋</span>
									</div>
								</button>
							{/if}
						</div>

						<!-- Actions -->
						<div class="p-2">
							<button
								class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors"
								onclick={() => {
									showProfileDropdown = false;
									handleOpenProfile();
								}}
							>
								<span class="text-base">⚙️</span>
								<span>Profile Settings</span>
							</button>
							<button
								class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors"
								onclick={() => {
									showProfileDropdown = false;
									handleOpenFriends();
								}}
							>
								<span class="text-base">👨‍🚀</span>
								<span>Friends</span>
							</button>
							<button
								class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors"
								onclick={() => {
									showProfileDropdown = false;
									handleOpenGroups();
								}}
							>
								<span class="text-base">🗂️</span>
								<span>Groups</span>
							</button>
							<button
								class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-white hover:bg-white/[0.08] rounded-lg transition-colors"
								onclick={async () => {
									showProfileDropdown = false;
									const answer = await ask('Are you sure you want to sign out?', {
										title: 'Sign Out',
										kind: 'info'
									});
									if (answer) {
										handleSignOut();
									}
								}}
							>
								<span class="text-base">🚪</span>
								<span>Sign out</span>
							</button>
						</div>
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="bg-indigo-600 text-white border border-indigo-700 px-2 md:px-3 py-1.5 font-medium rounded transition-colors duration-200 flex items-center gap-1.5 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
				onclick={handleSignIn}
				disabled={isAuthenticating}
			>
				{#if isAuthenticating}
					<div class="spinner-small"></div>
					<span class="hidden sm:inline">Authenticating...</span>
				{:else}
					<svg width="16" height="16" viewBox="0 0 127.14 96.36" fill="currentColor">
						<path
							d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"
						/>
					</svg>
					<span class="hidden sm:inline">Sign in with Discord</span>
					<span class="sm:hidden">Sign in</span>
				{/if}
			</button>

			<!-- Auth Error Display -->
			{#if authError && !isSignedIn}
				<div
					class="absolute top-full right-0 mt-2 bg-red-900/90 text-white text-sm px-3 py-2 rounded shadow-lg max-w-xs z-50"
				>
					{authError}
				</div>
			{/if}
		{/if}
	</aside>
</header>

{#if showConnectionDialog && isSignedIn && discordUser}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
		role="button"
		tabindex="0"
		onclick={handleDismiss}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				handleDismiss();
			}
		}}
	>
		<div
			class="bg-slate-800 border border-red-500/50 rounded-lg shadow-error max-w-md w-full mx-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="dialog-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="px-6 py-4 border-b border-white/10 flex items-center gap-3">
				<span class="text-2xl">⚠️</span>
				<h2 id="dialog-title" class="text-xl font-semibold text-white m-0">Connection Lost</h2>
			</div>
			<div class="px-6 py-5">
				<p class="text-white/80 text-base leading-relaxed m-0">
					The connection to the server was lost. Would you like to try reconnecting?
				</p>
			</div>
			<div class="px-6 py-4 flex gap-3 justify-end border-t border-white/10">
				<button
					class="text-white border border-white/5 px-5 py-2.5 font-medium rounded transition-colors duration-200 hover:bg-white/20"
					onclick={handleDismiss}
				>
					Dismiss
				</button>
				<button
					class="bg-green-600 text-white px-5 py-2.5 font-medium rounded transition-colors duration-200 hover:bg-green-700"
					onclick={handleReconnect}
				>
					Reconnect
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.glow-success {
		box-shadow: 0 0 6px var(--color-success-glow);
	}

	.shadow-error {
		box-shadow: 0 8px 32px var(--color-error-glow);
	}
</style>
