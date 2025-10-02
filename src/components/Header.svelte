<script lang="ts">
	import { BrushCleaning, Copy, FileText, Download, ScrollText } from '@lucide/svelte';
	import type { Friend as FriendType } from '../types';
	import { load } from '@tauri-apps/plugin-store';
	import { ask } from '@tauri-apps/plugin-dialog';

	let {
		playerId,
		friendCode,
		friendsList,
		saveFriendsListToStore,
		connectWebSocket,
		disconnectWebSocket,
		connectionStatus,
		ws,
		copiedStatusVisible,
		selectFile,
		logLocation = $bindable(),
		playerName,
		clearLogs,
		updateInfo,
		installUpdate,
		connectionError,
		isSignedIn,
		discordUser,
		handleSignIn,
		handleSignOut
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

	type LogVersion = 'LIVE' | 'PTU' | 'HOTFIX';
	let getLogVersion = () => {
		if (logLocation?.includes('PTU')) {
			return 'PTU';
		}
		if (logLocation?.includes('HOTFIX')) {
			return 'HOTFIX';
		}
		return 'LIVE';
	};
	let logVersionSelect = $state<LogVersion>(getLogVersion());
	let logVersionSelectOptions = $state<(LogVersion | 'Select new')[]>(['LIVE', 'PTU', 'HOTFIX', 'Select new']);
	let logVersionDropdownOpen = $state(false);

	async function selectVersion(version: LogVersion | 'Select new') {
		logVersionDropdownOpen = false;

		if (version === 'Select new') {
			selectFile();
			return;
		}

		logVersionSelect = version;
		// Store selected version and trigger file selection
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});
		await store.set('selectedEnvironment', version);
		await store.save();
		// Trigger file selection with new environment
		selectFile(version);
	}

	function toggleLogVersionDropdown() {
		logVersionDropdownOpen = !logVersionDropdownOpen;
	}

	let userDropdownOpen = $state(false);

	function toggleUserDropdown() {
		userDropdownOpen = !userDropdownOpen;
	}

	function closeUserDropdown() {
		userDropdownOpen = false;
	}

	$effect(() => {
		if (logLocation) {
			logVersionSelect = getLogVersion();
		}
	});

	// Show dialog when connection error occurs
	let showConnectionDialog = $state(false);
	let lastConnectionError = $state<string | null>(null);
	let showReconnectButton = $state(false);

	$effect(() => {
		// Show dialog only when error changes (new error occurred) and user is signed in
		if (connectionError && connectionError !== lastConnectionError && isSignedIn && discordUser) {
			showConnectionDialog = true;
			showReconnectButton = false;
			lastConnectionError = connectionError;
		} else if (!connectionError) {
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
</script>

<header
	class="h-[70px] flex justify-between items-center bg-[rgb(10,30,42)] border-b border-white/20 px-4 pl-1.5">
	<div class="flex items-center gap-2">
		<img src="/pico.webp" alt="Picologs" class="w-12 h-12" />
		<h1 class="text-2xl font-medium m-0">Picologs</h1>
	</div>

	<aside class="flex gap-3 items-center">
		{#if showReconnectButton && isSignedIn && discordUser}
			<button
				class="bg-[#f44336] text-white border border-[#d32f2f] px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-[#d32f2f] animate-pulse"
				onclick={handleReconnect}
				title="Connection lost - click to reconnect">
				⚠️ Reconnect
			</button>
		{/if}
		{#if updateInfo}
			<button
				class="bg-[#4caf50] text-white border border-white/20 px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-[#45a049]"
				onclick={installUpdate}>
				<Download size={18} /> Update Available
			</button>
		{/if}
		<button
			class="relative overflow-hidden bg-white/10 text-white border border-white/20 px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-white/20"
			onclick={() => {
				const textToCopy = `My Picologs Friend Code: ${friendCode || 'Not set'}`;
				navigator.clipboard.writeText(textToCopy);
				copiedStatusVisible = true;
				setTimeout(() => {
					copiedStatusVisible = false;
				}, 1500);
			}}>
			<Copy size={18} />
			<p class="m-0">Friend Code: {friendCode || 'N/A'}</p>
			<span
				class="absolute inset-0 flex items-center justify-center bg-[rgba(0,150,50,0.9)] text-white z-10 pointer-events-none transition-opacity duration-300"
				class:opacity-100={copiedStatusVisible}
				class:opacity-0={!copiedStatusVisible}>
				Copied Friend Code!
			</span>
		</button>
		{#if logLocation}
			<div class="relative">
				<button
					class="bg-white/10 text-white border border-white/20 px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-white/20"
					onclick={toggleLogVersionDropdown}
					title="Select Game.log file">
					<ScrollText size={18} />
					<span>{logVersionSelect}</span>
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
						class="absolute top-full left-0 mt-2 bg-[rgb(10,30,42)] border border-white/20 rounded min-w-[120px] shadow-md z-[1000] overflow-hidden">
						{#each logVersionSelectOptions as option}
							<button
								class="w-full px-4 py-2 bg-transparent border-none text-white text-left cursor-pointer text-sm transition-colors duration-150 flex items-center hover:bg-white/10 {logVersionSelect ===
								option
									? 'bg-white/5'
									: ''}"
								onclick={() => selectVersion(option)}>
								{option}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="bg-white/10 text-white border border-white/20 px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-white/20"
				onclick={selectFile}
				title="Select Game.log file">
				<FileText size={18} />Select Game.log file
			</button>
		{/if}

		<button
			class="bg-white/10 text-white border border-white/20 px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-white/20"
			onclick={handleClearLogs}
			title="Clear all logs">
			<BrushCleaning size={18} /> Clear Logs
		</button>

		{#if isSignedIn && discordUser}
			<div class="relative">
				<button
					class="flex items-center justify-center rounded-full cursor-pointer p-0 border-0 bg-transparent"
					onclick={toggleUserDropdown}
					title={connectionError || (connectionStatus === 'connected' ? 'Online' : 'Offline')}>
					<div class="relative flex items-center justify-center">
						{#if discordUser.avatar && discordUser.id}
							<img
								src={`https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=64`}
								alt={discordUser.username}
								class="w-9 h-9 rounded-full border-2 transition-[border-color] duration-300"
								class:border-[#4caf50]={connectionStatus === 'connected'}
								class:shadow-[0_0_6px_rgba(76,175,80,0.4)]={connectionStatus === 'connected'}
								class:border-[#f44336]={connectionStatus === 'disconnected'}
								class:border-[#ff9800]={connectionStatus === 'connecting'} />
						{:else}
							<div
								class="w-9 h-9 rounded-full border-2 flex items-center justify-center bg-[rgba(88,101,242,0.5)] font-semibold text-[0.95rem] transition-[border-color] duration-300"
								class:border-[#4caf50]={connectionStatus === 'connected'}
								class:shadow-[0_0_6px_rgba(76,175,80,0.4)]={connectionStatus === 'connected'}
								class:border-[#f44336]={connectionStatus === 'disconnected'}
								class:border-[#ff9800]={connectionStatus === 'connecting'}>
								{discordUser.username.charAt(0).toUpperCase()}
							</div>
						{/if}
						{#if connectionStatus === 'connecting'}
							<div class="spinner-small"></div>
						{/if}
					</div>
				</button>
				{#if userDropdownOpen}
					<div
						class="absolute top-[calc(100%+0.5rem)] right-0 bg-[rgb(15,35,47)] border border-[rgba(88,101,242,0.3)] rounded min-w-[200px] shadow-[0_4px_12px_rgba(0,0,0,0.3)] z-[1000] overflow-hidden">
						<div class="px-4 py-3 flex flex-col gap-1">
							<span class="text-white font-medium text-[0.95rem]">{discordUser.username}</span>
							<span
								class="text-xs font-normal"
								class:text-[#4caf50]={connectionStatus === 'connected'}
								class:text-[#f44336]={connectionStatus !== 'connected'}>
								{connectionStatus === 'connected' ? 'Online' : 'Offline'}
							</span>
						</div>
						<div class="h-px bg-white/10 my-1"></div>
						<button
							class="w-full px-4 py-2.5 bg-transparent border-none text-white text-left cursor-pointer text-sm transition-colors duration-150 flex items-center hover:bg-[rgba(88,101,242,0.2)]"
							onclick={() => {
								closeUserDropdown(); /* TODO: Navigate to admin page */
							}}>
							Admin
						</button>
						<div class="h-px bg-white/10 my-1"></div>
						<button
							class="w-full px-4 py-2.5 bg-transparent border-none text-[#f44336] text-left cursor-pointer text-sm transition-colors duration-150 flex items-center hover:bg-[rgba(244,67,54,0.1)]"
							onclick={() => {
								closeUserDropdown();
								handleSignOut();
							}}>
							Sign Out
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<button
				class="bg-[#5865F2] text-white border border-[#4752C4] px-4 py-2 font-medium rounded cursor-pointer transition-colors duration-200 flex items-center gap-2 hover:bg-[#4752C4]"
				onclick={handleSignIn}>
				Sign in with Discord
			</button>
		{/if}
	</aside>
</header>

{#if showConnectionDialog && isSignedIn && discordUser}
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
		onclick={handleDismiss}>
		<div
			class="bg-[rgb(15,35,47)] border border-[#f44336]/50 rounded-lg shadow-[0_8px_32px_rgba(244,67,54,0.3)] max-w-md w-full mx-4"
			onclick={(e) => e.stopPropagation()}>
			<div class="px-6 py-4 border-b border-white/10 flex items-center gap-3">
				<span class="text-2xl">⚠️</span>
				<h2 class="text-xl font-semibold text-white m-0">Connection Lost</h2>
			</div>
			<div class="px-6 py-5">
				<p class="text-white/80 text-base leading-relaxed m-0">
					The connection to the server was lost. Would you like to try reconnecting?
				</p>
			</div>
			<div class="px-6 py-4 flex gap-3 justify-end border-t border-white/10">
				<button
					class="bg-white/10 text-white border border-white/20 px-5 py-2.5 font-medium rounded cursor-pointer transition-colors duration-200 hover:bg-white/20"
					onclick={handleDismiss}>
					Dismiss
				</button>
				<button
					class="bg-[#4caf50] text-white border border-[#45a049] px-5 py-2.5 font-medium rounded cursor-pointer transition-colors duration-200 hover:bg-[#45a049]"
					onclick={handleReconnect}>
					Reconnect
				</button>
			</div>
		</div>
	</div>
{/if}
