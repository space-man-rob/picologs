<script lang="ts">
	import { load } from '@tauri-apps/plugin-store';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { goto } from '$app/navigation';

	let {
		friendCode,
		connectWebSocket,
		connectionStatus,
		copiedStatusVisible = $bindable(),
		selectFile,
		logLocation = $bindable(),
		clearLogs,
		updateInfo,
		installUpdate,
		connectionError,
		isSignedIn,
		discordUser,
		handleSignIn,
		handleSignOut,
		isAuthenticating,
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
			logLocation = null;
			clearLogs();
		}
	}

	let logVersionDropdownOpen = $state(false);
	let showProfileDropdown = $state(false);
	let showNotificationsDropdown = $state(false);

	// Calculate notification count
	let notificationCount = $derived(
		(Array.isArray(friendRequests) ? friendRequests : []).filter((r: any) => r.direction === 'incoming').length +
		(Array.isArray(groupInvitations) ? groupInvitations : []).length
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

	// Show dialog when connection error occurs
	let showConnectionDialog = $state(false);
	let lastConnectionError = $state<string | null>(null);
	let showReconnectButton = $state(false);
	let errorDialogTimer = $state<number | null>(null);

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
			showConnectionDialog = false;
			showReconnectButton = false;
			lastConnectionError = null;
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
	class="h-[70px] flex justify-between items-center bg-panel border-b border-white/20 px-4 pl-1.5">
	<div class="flex items-center gap-2 flex-shrink-0">
		<img src="/pico.webp" alt="Picologs" class="w-12 h-12" />
		<h1 class="text-2xl font-medium m-0 text-white hidden sm:block">Picologs</h1>
	</div>

	<aside class="flex gap-2 md:gap-3 items-center flex-wrap justify-end">
		{#if showReconnectButton && isSignedIn && discordUser}
			<button
				class="bg-red-600 text-white px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-2 hover:bg-red-700 animate-pulse"
				onclick={handleReconnect}
				title="Connection lost - click to reconnect">
				⚠️ Reconnect
			</button>
		{/if}
		{#if updateInfo}
			<button
				class="bg-green-600 text-white px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-green-700 text-sm md:text-base"
				onclick={installUpdate}>
				⬇️ <span class="hidden md:inline">Update Available</span>
			</button>
		{/if}
		{#if isSignedIn && discordUser}
			<button
				class="bg-overlay-light text-white border border-white/20 px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-white/20"
				onclick={() => {
					const textToCopy = `My Picologs Friend Code: ${friendCode || 'Not set'}`;
					navigator.clipboard.writeText(textToCopy);
					copiedStatusVisible = true;
					setTimeout(() => {
						copiedStatusVisible = false;
					}, 1500);
				}}>
				{copiedStatusVisible ? '✅' : '📋'}
				<p class="m-0 text-sm md:text-base"><span class="hidden lg:inline">Friend Code:</span> {friendCode || 'N/A'}</p>
			</button>
		{/if}
		{#if logLocation}
			<div class="relative log-version-dropdown">
				<button
					class="bg-overlay-light text-white border border-white/20 px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-white/20 text-sm md:text-base"
					onclick={toggleLogVersionDropdown}
					title="Select Game.log file">
					📜
					<span class="hidden md:inline">{logLocation}</span>
					<div
						class="flex items-center justify-center w-4 h-4 transition-transform duration-200 {logVersionDropdownOpen
							? 'rotate-180'
							: ''}">
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round">
							<polyline points="6 9 12 15 18 9"></polyline>
						</svg>
					</div>
				</button>
				{#if logVersionDropdownOpen}
					<div
						class="absolute top-full left-0 mt-2 bg-panel border border-white/20 rounded min-w-[120px] shadow-lg z-[1000] overflow-hidden">
						<button
							class="w-full px-4 py-2 bg-transparent border-none text-white text-left cursor-pointer text-sm transition-colors duration-150 flex items-center hover:bg-overlay-light"
							onclick={() => selectVersion('Select new')}>
							Select new
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="bg-overlay-light text-white border border-white/20 px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-white/20 text-sm md:text-base"
				onclick={selectFile}
				title="Select Game.log file">
				📄 <span class="hidden sm:inline">Select Game.log file</span>
			</button>
		{/if}

		<button
			class="bg-overlay-light text-white border border-white/20 px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-white/20 text-sm md:text-base"
			onclick={handleClearLogs}
			title="Clear all logs">
			🧹 <span class="hidden md:inline">Clear Logs</span>
		</button>

		{#if isSignedIn && discordUser}
			<!-- Notifications Bell -->
			<div class="relative notifications-dropdown">
				<button
					onclick={() => showNotificationsDropdown = !showNotificationsDropdown}
					class="relative p-2 text-muted hover:text-white hover:bg-overlay-light rounded-lg transition-colors text-xl border border-transparent hover:border-white/20"
					title="Notifications">
					🔔
					{#if notificationCount > 0}
						<span class="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
							{notificationCount}
						</span>
					{/if}
				</button>

				{#if showNotificationsDropdown}
					{@const incomingFriendRequests = (Array.isArray(friendRequests) ? friendRequests : []).filter((r: any) => r.direction === 'incoming')}
					<div class="absolute right-0 mt-2 w-80 md:w-96 max-w-[calc(100vw-2rem)] bg-panel-dark border border-panel rounded-lg shadow-xl z-[1000] max-h-[min(600px,80vh)] overflow-y-auto">
						<div class="p-4 border-b border-panel">
							<h3 class="text-lg font-semibold text-white">Notifications</h3>
						</div>

						{#if incomingFriendRequests.length === 0 && groupInvitations.length === 0}
							<div class="p-8 text-center text-muted">
								<div class="text-5xl mx-auto mb-2 opacity-50">🔔</div>
								<p>No pending notifications</p>
							</div>
						{:else}
							<div class="divide-y divide-white/10">
								{#each incomingFriendRequests as request}
									<div class="p-4 hover:bg-overlay-light">
										<div class="flex items-start gap-3 mb-3">
											{#if request.fromAvatar}
												<img
													src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${request.fromDiscordId}/${request.fromAvatar}.png?size=64`}
													alt={request.fromUsername}
													class="w-10 h-10 rounded-full flex-shrink-0"
												/>
											{:else}
												<div class="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-xl">
													➕
												</div>
											{/if}
											<div class="flex-1 min-w-0">
												<p class="text-xs font-semibold text-blue-400 mb-1">Friend Request</p>
												<p class="text-sm font-medium text-white">{request.fromUsername}</p>
												{#if request.fromPlayer}
													<p class="text-xs text-muted">{request.fromPlayer}</p>
												{/if}
												<p class="text-xs text-subtle mt-1">
													{new Date(request.createdAt).toLocaleDateString()}
												</p>
											</div>
										</div>
										<div class="flex gap-2">
											<button
												onclick={() => onAcceptFriend?.(request.id)}
												disabled={processingFriendRequests.has(request.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
												{#if processingFriendRequests.has(request.id)}
													<span class="inline-block animate-spin">⏳</span>
												{:else}
													✓
												{/if}
												Accept
											</button>
											<button
												onclick={() => onDenyFriend?.(request.id)}
												disabled={processingFriendRequests.has(request.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-overlay-light text-white text-sm rounded border border-white/20 hover:bg-white/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
												{#if processingFriendRequests.has(request.id)}
													<span class="inline-block animate-spin">⏳</span>
												{:else}
													✕
												{/if}
												Deny
											</button>
										</div>
									</div>
								{/each}

								{#each groupInvitations as invitation}
									<div class="p-4 hover:bg-overlay-light">
										<div class="flex items-start gap-3 mb-3">
											{#if invitation.group?.avatar}
												<img
													src={invitation.group.avatar}
													alt={invitation.group.name}
													class="w-10 h-10 rounded-lg object-cover flex-shrink-0"
												/>
											{:else}
												<div class="p-2 bg-blue-600/20 rounded-lg flex-shrink-0 text-xl">
													🙏
												</div>
											{/if}
											<div class="flex-1 min-w-0">
												<p class="text-xs font-semibold text-blue-400 mb-1">Join Group Request</p>
												<p class="text-sm font-medium text-white">{invitation.group?.name || 'Unknown Group'}</p>
												<p class="text-xs text-muted">Invited by {invitation.inviter?.username || 'Unknown User'}</p>
												<p class="text-xs text-subtle mt-1">
													{new Date(invitation.createdAt).toLocaleDateString()}
												</p>
											</div>
										</div>
										<div class="flex gap-2">
											<button
												onclick={() => onAcceptInvitation?.(invitation.id)}
												disabled={processingGroupInvitations.has(invitation.id)}
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
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
												class="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-overlay-light text-white text-sm rounded border border-white/20 hover:bg-white/15 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed">
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
					onclick={() => showProfileDropdown = !showProfileDropdown}
					class="flex items-center justify-center rounded-full p-0 border-0 bg-transparent cursor-pointer"
					title={connectionError || (connectionStatus === 'connected' ? 'Online' : 'Offline')}>
					<div class="relative flex items-center justify-center">
						{#if discordUser.avatar && discordUser.id}
							<img
								src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`}
								alt={discordUser.username}
								class="w-9 h-9 rounded-full border-2 transition-[border-color] duration-300"
								class:border-green-500={connectionStatus === 'connected'}
								class:glow-success={connectionStatus === 'connected'}
								class:border-red-500={connectionStatus === 'disconnected'}
								class:border-orange-500={connectionStatus === 'connecting'} />
						{:else}
							<div
								class="w-9 h-9 rounded-full border-2 flex items-center justify-center bg-indigo-600/50 font-semibold text-[0.95rem] transition-[border-color] duration-300"
								class:border-green-500={connectionStatus === 'connected'}
								class:glow-success={connectionStatus === 'connected'}
								class:border-red-500={connectionStatus === 'disconnected'}
								class:border-orange-500={connectionStatus === 'connecting'}>
								{(discordUser.username || 'U').charAt(0).toUpperCase()}
							</div>
						{/if}
						{#if connectionStatus === 'connecting'}
							<div class="spinner-small"></div>
						{/if}
					</div>
				</button>

				{#if showProfileDropdown}
				<div
					class="absolute right-0 mt-2 w-64 bg-panel-dark border border-panel rounded-lg shadow-xl z-[1000]"
				>
					<!-- Profile Info -->
					<div class="p-4 border-b border-panel">
						<div class="flex items-center gap-3 mb-3">
							{#if discordUser.avatar && discordUser.id}
								<img
									src={`${import.meta.env.VITE_DISCORD_CDN_URL}/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`}
									alt={discordUser.username}
									class="w-12 h-12 rounded-full"
								/>
							{:else}
								<div class="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-2xl">
									👤
								</div>
							{/if}
							<div class="flex-1 min-w-0">
								<p class="text-sm font-semibold text-white truncate">{discordUser.username || 'User'}</p>
								<p
									class="text-xs font-normal truncate"
									class:text-green-500={connectionStatus === 'connected'}
									class:text-red-500={connectionStatus !== 'connected'}>
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
							class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-overlay-light rounded-lg transition-colors"
							onclick={() => {
								showProfileDropdown = false;
								handleOpenProfile();
							}}>
							<span class="text-base">⚙️</span>
							<span>Profile Settings</span>
						</button>
						<button
							class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-overlay-light rounded-lg transition-colors"
							onclick={() => {
								showProfileDropdown = false;
								handleOpenFriends();
							}}>
							<span class="text-base">👨‍🚀</span>
							<span>Friends</span>
						</button>
						<button
							class="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-overlay-light rounded-lg transition-colors"
							onclick={() => {
								showProfileDropdown = false;
								handleOpenGroups();
							}}>
							<span class="text-base">🙏</span>
							<span>Groups</span>
						</button>
						<button
							class="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
							onclick={() => {
								showProfileDropdown = false;
								handleSignOut();
							}}>
							<span class="text-base">🚪</span>
							<span>Sign out</span>
						</button>
					</div>
				</div>
				{/if}
			</div>
		{:else}
			<button
				class="bg-indigo-600 text-white border border-indigo-700 px-2 md:px-4 py-2 font-medium rounded transition-colors duration-200 flex items-center gap-1 md:gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
				onclick={handleSignIn}
				disabled={isAuthenticating}>
				{#if isAuthenticating}
					<div class="spinner-small"></div>
					<span class="hidden sm:inline">Authenticating...</span>
				{:else}
					<span class="hidden sm:inline">Sign in with Discord</span>
					<span class="sm:hidden">Sign in</span>
				{/if}
			</button>
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
		}}>
		<div
			class="bg-slate-800 border border-red-500/50 rounded-lg shadow-error max-w-md w-full mx-4"
			role="dialog"
			aria-modal="true"
			aria-labelledby="dialog-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}>
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
					class="bg-overlay-light text-white border border-white/20 px-5 py-2.5 font-medium rounded transition-colors duration-200 hover:bg-white/20"
					onclick={handleDismiss}>
					Dismiss
				</button>
				<button
					class="bg-green-600 text-white px-5 py-2.5 font-medium rounded transition-colors duration-200 hover:bg-green-700"
					onclick={handleReconnect}>
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
