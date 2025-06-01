<script lang="ts">
	import { BrushCleaning, Copy, FileText } from '@lucide/svelte';
	import type { Friend as FriendType } from '../types';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { load } from '@tauri-apps/plugin-store';


	let {
		playerId,
		friendCode,
		friendsList,
		saveFriendsListToStore,
		connectWebSocket,
		connectionStatus,
		ws,
		currentUserDisplayData,
		copiedStatusVisible,
		selectFile,
		logLocation = $bindable(),
		playerName,
		clearLogs
	} = $props();


	async function toggleOnlineStatus() {
		const store = await load('store.json', { autoSave: false });

		if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
			if (ws) {
				ws.close();
			}
			connectionStatus = 'disconnected';
			store.set('wouldGoOnline', false);

			friendsList = friendsList.map((friend: FriendType) => ({ ...friend, isOnline: false }));
			saveFriendsListToStore();
		} else {
			if (playerId) {
				store.set('wouldGoOnline', true);
				connectWebSocket();
			} else {
				alert('Please select a log file first to establish your Player ID and be able to go online.');
			}
		}
	}

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

	$effect(() => {
		if (playerId && friendCode) {
			const currentTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
			currentUserDisplayData = {
				id: playerId,
				name: playerName || 'Unknown player', // Always show name, with fallback
				friendCode: friendCode,
				status: 'confirmed',
				timezone: currentTz,
				isOnline: connectionStatus === 'connected'
			};
		} else {
			if (currentUserDisplayData !== null) {
				currentUserDisplayData = null;
			}
		}
	});

	type LogVersion = 'LIVE' | 'PTU';
	let getLogVersion = () => {
		if (logLocation?.includes('PTU')) {
			return 'PTU';
		}
		return 'LIVE';
	};
	let logVersionSelect = $state<LogVersion>(getLogVersion()); // LIVE, PTU
	let logVersionSelectOptions = $state<LogVersion[]>(['LIVE', 'PTU']);
	let selectVersion = (e: Event) => {
		logLocation = (e.target as HTMLSelectElement).value;
	};

	$effect(() => {
		if (logLocation) {
			logVersionSelect = getLogVersion();
		}
	});
	
</script>

<header>
	<div class="logo-container">
		<img src="/pico.webp" alt="Picologs" class="logo" />
		<h1>Picologs</h1>
	</div>

	<aside>
		<button
			class="friend-code-button"
			onclick={() => {
				const textToCopy = `My Picologs Friend Code: ${currentUserDisplayData?.friendCode || friendCode || 'Not set'}`;
				navigator.clipboard.writeText(textToCopy);
				copiedStatusVisible = true;
				setTimeout(() => {
					copiedStatusVisible = false;
				}, 1500);
			}}>
			<Copy size={18} />
			<p>Friend Code: {currentUserDisplayData?.friendCode || friendCode || 'N/A'}</p>
			<span class="friend-code-copy-status" class:show-copied={copiedStatusVisible}>
				Copied Friend Code!
			</span>
		</button>
		{#if logLocation}
		<select class="log-version-select" value={logLocation} onchange={selectVersion} title="Select Game.log file">
			{#each logVersionSelectOptions as option}
				<option value={option} selected={logVersionSelect === option}>
					{option}
					</option>
				{/each}
			</select>
		{:else}
			<button class="log-version-choose-button" onclick={selectFile} title="Select Game.log file">
				<FileText size={18} />Select Game.log file
			</button>
		{/if}

		<button onclick={handleClearLogs} title="Clear all logs">
			<BrushCleaning size={18} /> Clear Logs
		</button>
		<!-- <button onclick={clearSettings} title="Clear all settings and log file">Clear Settings</button> -->

		<button class="online-status-button" onclick={toggleOnlineStatus}>
			{#if connectionStatus === 'connecting'}
				<div class="spinner"></div>
			{:else}
				<span
					class="status-dot"
					class:green={connectionStatus === 'connected'}
					class:red={connectionStatus === 'disconnected'}>
				</span>
				{#if connectionStatus === 'connected'}
					Online
				{:else}
					Offline
				{/if}
			{/if}
		</button>
	</aside>
</header>

<style>
	header {
		height: 70px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgb(10, 30, 42);
		border-bottom: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0 15px 0 5px;
	}

	button {
		background-color: rgba(255, 255, 255, 0.1);
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 1rem;
		font-weight: 500;
		border-radius: 4px;
		cursor: pointer;
		transition: background-color 0.2s ease-in-out;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	button:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.logo {
		width: 3rem;
		height: 3rem;
	}

	.logo-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	aside {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 500;
		margin: 0;
	}

	.friend-code-button {
		position: relative;
		overflow: hidden;
	}
	.friend-code-button p {
		margin: 0;
	}

	.friend-code-copy-status {
		color: rgba(255, 255, 255, 0.8);
		opacity: 0;
		transition: opacity 0.3s ease-in-out;
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 150, 50, 0.9);
		color: #fff;
		z-index: 10;
		pointer-events: none;
	}

	.friend-code-copy-status.show-copied {
		opacity: 1;
	}

	.online-status-button {
		min-width: 120px;
		justify-content: center;
		display: flex;
		align-items: center;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-dot {
		display: inline-block;
		width: 15px;
		height: 15px;
		border-radius: 50%;

		border: 1px solid rgba(0, 0, 0, 0.2);
	}

	.status-dot.green {
		background-color: #4caf50;
		border-color: #388e3c;
	}

	.status-dot.red {
		background-color: #f44336;
		border-color: #d32f2f;
	}

	.spinner {
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-radius: 50%;
		border-top-color: #fff;
		width: 16px;
		height: 16px;
		animation: spin 1s ease-in-out infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.log-version-select {
		background-color: rgba(255, 255, 255, 0.1);
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.5rem 1rem;
		font-weight: 500;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		transition: background-color 0.2s ease-in-out;

		&,
		&::picker(select) {
			appearance: base-select;
			background-color: rgba(255, 255, 255, 0.1);
			width: 100px;
			overflow: hidden;
			border: 1px solid rgba(255, 255, 255, 0.2);
			border-radius: 4px;
		}
	}

	.log-version-select:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.log-version-select option {
		background-color: rgb(10, 30, 42);
		color: #fff;
		padding: 0.25rem 0.5rem;
		font-weight: 500;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		gap: 0.5rem;
		width: 100px;
	}
</style>
