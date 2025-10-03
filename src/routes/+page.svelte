<script lang="ts">
	import { readTextFile, watchImmediate, writeFile } from '@tauri-apps/plugin-fs';
	import { load } from '@tauri-apps/plugin-store';
	import { open } from '@tauri-apps/plugin-dialog';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import Item from '../components/Item.svelte';
	import { onMount } from 'svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import Friends from '../components/Friends.svelte';
	import User from '../components/User.svelte';
	import AddFriend from '../components/AddFriend.svelte';
	import type { Log, Friend as FriendType } from '../types';
	import { appDataDir } from '@tauri-apps/api/path';
	import Header from '../components/Header.svelte';
	import Resizer from '../components/Resizer.svelte';
	import { check } from '@tauri-apps/plugin-updater';
	import { loginWithDiscord, loadAuthData, signOut, handleAuthComplete, getJwtToken } from '$lib/oauth';
	import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
	import WebSocket from '@tauri-apps/plugin-websocket';
	import {
		connectWebSocket as apiConnectWebSocket,
		disconnectWebSocket as apiDisconnectWebSocket,
		fetchFriends,
		fetchFriendRequests,
		fetchUserProfile,
		sendFriendRequest as apiSendFriendRequest,
		removeFriend as apiRemoveFriend,
		subscribe as apiSubscribe,
		getWebSocket,
		type ApiFriend
	} from '$lib/api';

	// Authentication state
	let isSignedIn = $state(false);
	let discordUser = $state<{ id: string; username: string; avatar: string | null } | null>(null);
	let discordUserId = $state<string | null>(null); // Discord user ID for WebSocket auth

	let ws = $state<any>(null); // Tauri WebSocket type
	let file = $state<string | null>(null);
	let fileContent = $state<Log[]>([]);
	let playerName = $state<string | null>(null);
	let playerId = $state<string | null>(null); // Star Citizen player ID from Game.log
	let isLoadingFile = $state(true); // Prevent flash of welcome screen
	let tick = $state(0);
	let logLocation = $state<string | null>(null);
	let selectedEnvironment = $state<'LIVE' | 'PTU' | 'HOTFIX'>('LIVE');
	let prevLineCount = $state<number>(0);
	let lineCount = $state<number>(0);
	let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
	let copiedStatusVisible = $state(false);
	let reconnectTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	let connectionError = $state<string | null>(null);
	let friendsList = $state<FriendType[]>([]);
	let currentUserDisplayData = $state<FriendType | null>(null);
	let updateInfo = $state<any>(null);

	// API-fetched friend data
	let apiFriends = $state<ApiFriend[]>([]);
	let apiFriendRequests = $state<any[]>([]);
	let apiUserProfile = $state<{ friendCode: string | null } | null>(null);

	// WebSocket reconnection state
	let reconnectAttempts = $state(0);
	let autoConnectionAttempted = $state(false);

	// Sync user profile from API (includes friend code)
	async function syncUserProfileFromAPI() {
		if (!isSignedIn) {
			console.log('[API] Not syncing user profile - not signed in');
			return;
		}

		console.log('[API] Fetching user profile from API...');
		const profile = await fetchUserProfile();
		if (profile) {
			apiUserProfile = profile;

			// Also set discordUser for UI display
			discordUser = {
				id: profile.discordId,
				username: profile.username,
				avatar: profile.avatar
			};

			console.log('[API] Synced user profile from database');
		}
	}

	// Sync friends from API
	async function syncFriendsFromAPI() {
		if (!isSignedIn) {
			console.log('[API] Not syncing friends - not signed in');
			return;
		}

		console.log('[API] Fetching friends from API...');
		const friends = await fetchFriends();
		apiFriends = friends;

		// Convert API friends to local format
		friendsList = friends.map((f) => ({
			id: f.friendUserId,
			friendCode: '', // Friend code not needed in display
			name: f.friendUsePlayerAsDisplayName && f.friendPlayer
				? f.friendPlayer
				: f.friendUsername,
			status: 'confirmed' as const,
			timezone: f.friendTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			isOnline: false, // Will be updated by WebSocket
			isConnected: false
		}));

		console.log('[API] Synced', friends.length, 'friends');
	}

	// Sync friend requests from API
	async function syncFriendRequestsFromAPI() {
		if (!isSignedIn) {
			console.log('[API] Not syncing friend requests - not signed in');
			return;
		}

		console.log('[API] Fetching friend requests from API...');
		const requests = await fetchFriendRequests();
		apiFriendRequests = requests;

		console.log('[API] Synced', requests.length, 'friend requests');
	}

	async function disconnectWebSocket() {
		await apiDisconnectWebSocket();
		connectionStatus = 'disconnected';
		ws = null;
	}

	async function installUpdate() {
		if (updateInfo) {
			await updateInfo.downloadAndInstall();
		}
	}

	// OTP auth state
	let authSessionId = $state<string | null>(null);
	let otpCode = $state('');
	let awaitingOtp = $state(false);
	let authError = $state<string | null>(null);
	let jwtToken = $state<string | null>(null);
	let isVerifyingOtp = $state(false);

	// Authentication functions - NEW OTP FLOW
	async function handleSignIn() {
		authError = null;

		// Generate unique session ID
		const sessionId = crypto.randomUUID();
		authSessionId = sessionId;

		console.log('[Auth] Starting new OTP auth flow with session ID:', sessionId);

		try {
			// Connect to WebSocket
			connectionStatus = 'connecting';
			const wsUrl = import.meta.env.DEV
				? 'ws://127.0.0.1:8080/ws'
				: 'wss://picologs-ws.fly.dev/ws';

			console.log('[Auth] Connecting to WebSocket:', wsUrl);
			const socket = await WebSocket.connect(wsUrl);

			// Set up message listener for OTP-related messages
			socket.addListener((msg: any) => {
				try {
					// Handle different message formats from Tauri WebSocket
					let messageStr: string;
					if (typeof msg === 'string') {
						messageStr = msg;
					} else if (msg.data && typeof msg.data === 'string') {
						messageStr = msg.data;
					} else if (msg.type === 'Text' && msg.data) {
						messageStr = msg.data;
					} else {
						console.log('[Auth WS] Received non-text message, skipping:', typeof msg);
						return;
					}

					const message = JSON.parse(messageStr);
					console.log('[Auth WS] Received message:', message.type, message);

					// OTP is ready - show input to user
					if (message.type === 'otp_ready' && message.sessionId === sessionId) {
						console.log('[Auth] OTP is ready, waiting for user to enter code');
						awaitingOtp = true;
					}

					// OTP verification response
					if (message.type === 'response' && message.requestId === 'verify_otp') {
						if (message.data?.success && message.data?.jwt) {
							console.log('[Auth] OTP verified! Received JWT token');
							jwtToken = message.data.jwt;
							completeAuth(message.data.jwt);
						} else {
							console.error('[Auth] OTP verification failed:', message.message);
							authError = message.message || 'Invalid OTP code';
						}
					}

					if (message.type === 'error') {
						console.error('[Auth] WebSocket error:', message.message);
						authError = message.message;
					}
				} catch (error) {
					// Silently skip non-JSON messages (like Tauri metadata)
					if (error instanceof SyntaxError) {
						console.log('[Auth WS] Skipping non-JSON message');
					} else {
						console.error('[Auth WS] Error handling message:', error);
					}
				}
			});

			// Send init_desktop_auth message
			await socket.send(JSON.stringify({
				type: 'init_desktop_auth',
				sessionId: sessionId,
				requestId: 'init_auth'
			}));

			ws = socket;
			connectionStatus = 'connected';
			console.log('[Auth] WebSocket connected, session initiated');

			// Open browser to auth page
			const websiteUrl = import.meta.env.DEV
				? 'http://localhost:5173'
				: 'https://picologs.com';
			const authUrl = `${websiteUrl}/auth/desktop?session=${sessionId}`;

			console.log('[Auth] Opening browser to:', authUrl);
			await openUrl(authUrl);

		} catch (error) {
			console.error('[Auth] Failed to initiate auth:', error);
			connectionStatus = 'disconnected';
			authError = 'Failed to connect to server. Please try again.';
		}
	}

	// Submit OTP code
	async function submitOtp() {
		if (!otpCode || otpCode.length !== 6 || !authSessionId || !ws) {
			authError = 'Please enter a valid 6-digit code';
			return;
		}

		authError = null;
		isVerifyingOtp = true;

		try {
			console.log('[Auth] Submitting OTP for verification');
			await ws.send(JSON.stringify({
				type: 'verify_otp',
				requestId: 'verify_otp',
				data: {
					sessionId: authSessionId,
					otp: otpCode
				}
			}));
		} catch (error) {
			console.error('[Auth] Failed to submit OTP:', error);
			authError = 'Failed to verify code. Please try again.';
			isVerifyingOtp = false;
		}
	}

	// Complete authentication after JWT received
	async function completeAuth(jwt: string) {
		try {
			// Store JWT in auth store
			const authStore = await load('auth.json', {
				defaults: {},
				autoSave: false
			});
			await authStore.set('jwtToken', jwt);
			await authStore.save(); // Save immediately after setting JWT

			// Decode JWT to get user info
			const [, payloadB64] = jwt.split('.');
			const payload = JSON.parse(atob(payloadB64));

			discordUserId = payload.userId;
			isSignedIn = true;

			console.log('[Auth] Authentication complete! Discord user ID:', discordUserId);

			// Save to store
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.set('discordUserId', discordUserId);
			await store.save();

			// Reset auth UI state
			awaitingOtp = false;
			otpCode = '';
			authSessionId = null;
			authError = null;

			// Disconnect old WebSocket (auth session)
			if (ws) {
				try {
					await ws.disconnect();
				} catch (error) {
					console.error('[WebSocket] Error disconnecting:', error);
				}
			}
			ws = null;

			// Disconnect API WebSocket as well
			await apiDisconnectWebSocket();

			// Reconnect with JWT token - this will update both ws and API WebSocket
			await connectWebSocket();

			// Fetch user profile from API and store in auth.json for persistence
			try {
				const profile = await fetchUserProfile();
				if (profile) {
					// Store Discord user data in the format expected by loadAuthData()
					const discordUserData = {
						id: profile.discordId,
						username: profile.username,
						discriminator: '0',
						avatar: profile.avatar,
						global_name: profile.username
					};
					await authStore.set('discord_user', discordUserData);
					await authStore.save();

					// Update UI state
					discordUser = {
						id: profile.discordId,
						username: profile.username,
						avatar: profile.avatar
					};

					console.log('[Auth] User profile loaded and persisted');
				}
			} catch (error) {
				console.error('[Auth] Failed to fetch user profile:', error);
				// Continue anyway - user is authenticated, profile can be loaded later
			}

		} catch (error) {
			console.error('[Auth] Failed to complete authentication:', error);
			authError = 'Failed to complete sign in. Please try again.';
		}
	}

	async function handleSignOut() {
		try {
			await signOut();
			isSignedIn = false;
			discordUser = null;
			discordUserId = null;

			// Clear Discord user ID from store
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.delete('discordUserId');
			await store.save();

			// Disconnect WebSocket when signing out
			if (ws) {
				try {
					await ws.disconnect();
				} catch (error) {
					console.error('[WebSocket] Error disconnecting:', error);
				}
			}
			connectionStatus = 'disconnected';

			console.log('[Auth] Successfully signed out');
		} catch (error) {
			console.error('Sign out failed:', error);
		}
	}

	async function getLogFilePath(): Promise<string> {
		const dir = await appDataDir();
		return dir.endsWith('/') ? `${dir}logs.json` : `${dir}/logs.json`;
	}

	// Utility to deduplicate and sort logs by id and timestamp
	function dedupeAndSortLogs(logs: Log[]): Log[] {
		const seen = new Set<string>();
		const deduped = [];
		for (const log of logs) {
			if (!seen.has(log.id)) {
				seen.add(log.id);
				deduped.push(log);
			}
		}
		return deduped.sort(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
		);
	}

	async function loadLogsFromDisk(): Promise<Log[]> {
		try {
			const filePath = await getLogFilePath();
			const text = await readTextFile(filePath);
			return dedupeAndSortLogs(JSON.parse(text) as Log[]);
		} catch (e) {
			return [];
		}
	}

	async function saveLogsToDisk(logs: Log[]): Promise<void> {
		const encoder = new TextEncoder();
		const data = encoder.encode(JSON.stringify(dedupeAndSortLogs(logs), null, 2));
		const filePath = await getLogFilePath();
		await writeFile(filePath, data);
	}

	async function appendLogToDisk(newLog: Log): Promise<void> {
		const logs = await loadLogsFromDisk();
		logs.push(newLog);
		const logsToSave = logs.map((log) => (log.userId ? log : { ...log, userId: playerId! }));
		await saveLogsToDisk(logsToSave);
	}

	let onlyProcessLogsAfterThisDateTimeStamp = $state<number | null>(null);
	async function clearLogs() {
		await saveLogsToDisk([]);
		fileContent = [];

		// Read current file to get line count for tracking position
		if (file) {
			try {
				const linesText = await readTextFile(file);
				const currentLineCount = linesText.split('\n').length;
				prevLineCount = currentLineCount;
			} catch (error) {
				prevLineCount = 0;
			}
		}

		// Reset displayed line count to 0
		lineCount = 0;
		onlyProcessLogsAfterThisDateTimeStamp = new Date().getTime();
	}

	setInterval(() => {
		tick += 1;
		if (tick > 5 && file) {
			handleFile(file);
		}
	}, 1000);

	function generateId(length: number = 10) {
		return crypto.randomUUID().slice(0, length);
	}

	function groupKillingSprees(logs: Log[]): Log[] {
		const spreeTimeWindow = 2 * 60 * 1000; // 2 minutes
		const minKillsForSpree = 2;
		const childLogIds = new Set<string>();

		const standaloneActorDeaths = logs.filter(
			(log) =>
				!log.children?.length &&
				log.eventType === 'actor_death' &&
				log.metadata?.killerId &&
				log.metadata.killerId !== '0' &&
				log.metadata.killerId !== log.metadata.victimId &&
				log.metadata.damageType !== 'VehicleDestruction'
		);

		const killsByPlayer = new Map<string, Log[]>();
		for (const death of standaloneActorDeaths) {
			const killerId = death.metadata!.killerId!;
			if (!killsByPlayer.has(killerId)) {
				killsByPlayer.set(killerId, []);
			}
			killsByPlayer.get(killerId)!.push(death);
		}

		const spreeParents = new Map<string, Log>();

		for (const kills of killsByPlayer.values()) {
			if (kills.length < minKillsForSpree) continue;

			let currentSpree: Log[] = [];
			const processSpree = () => {
				if (currentSpree.length >= minKillsForSpree) {
					const firstKill = currentSpree[0];
					const parentLog = {
						...firstKill,
						id: firstKill.id + '-spree',
						eventType: 'killing_spree' as const,
						line: `${firstKill.metadata!.killerName} is on a killing spree (${currentSpree.length} kills)`,
						emoji: '🎯',
						children: currentSpree.map((l) => ({ ...l, children: [] }))
					};
					spreeParents.set(firstKill.id, parentLog);
					for (const kill of currentSpree) {
						childLogIds.add(kill.id);
					}
				}
			};

			for (let i = 0; i < kills.length; i++) {
				if (currentSpree.length === 0) {
					currentSpree.push(kills[i]);
				} else {
					const lastKillTime = new Date(
						currentSpree[currentSpree.length - 1].timestamp
					).getTime();
					const currentKillTime = new Date(kills[i].timestamp).getTime();

					if (currentKillTime - lastKillTime < spreeTimeWindow) {
						currentSpree.push(kills[i]);
					} else {
						processSpree();
						currentSpree = [kills[i]];
					}
				}
			}
			processSpree();
		}

		const finalLogs: Log[] = [];
		let childrenFiltered = 0;
		for (const log of logs) {
			if (spreeParents.has(log.id)) {
				finalLogs.push(spreeParents.get(log.id)!);
			} else if (!childLogIds.has(log.id)) {
				finalLogs.push(log);
			} else {
				childrenFiltered++;
			}
		}

		return finalLogs;
	}

	async function sendLogViaWebSocket(log: Log) {
		if (ws) {
			try {
				await ws.send(JSON.stringify({ type: 'log', log }));
				console.log('Sent log via WebSocket:', log);
			} catch (error) {
				console.error('[WebSocket] Error sending log:', error);
			}
		}
	}

	async function connectWebSocket(): Promise<void> {
		// Need at least a discordUserId to connect (can be temporary for OAuth)
		if (!discordUserId) {
			console.log('[WebSocket] Not connecting - no user ID available');
			connectionError = 'Please sign in with Discord to connect';
			return Promise.reject(new Error('No user ID available'));
		}

		if (ws) {
			return Promise.resolve();
		}

		// Clear any existing reconnection timer
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		connectionStatus = 'connecting';
		connectionError = null;

		try {
			// Set up subscriptions BEFORE connecting
			apiSubscribe('registered', async (message: any) => {
				console.log('[WebSocket] ✅ Successfully registered with server');
				// Initial sync after registration
				await syncUserProfileFromAPI();
				await syncFriendsFromAPI();
				await syncFriendRequestsFromAPI();
			});

			apiSubscribe('refetch_friends', async () => {
				console.log('[WebSocket] 🔄 Received refetch_friends notification');
				await syncFriendsFromAPI();
			});

			apiSubscribe('refetch_friend_requests', async () => {
				console.log('[WebSocket] 🔄 Received refetch_friend_requests notification');
				await syncFriendRequestsFromAPI();
			});

			apiSubscribe('user_online', async (message: any) => {
				if (message.userId) {
					const friendIndex = friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						friendsList = [
							...friendsList.slice(0, friendIndex),
							{ ...friendsList[friendIndex], isOnline: true },
							...friendsList.slice(friendIndex + 1)
						];

						// Send our logs to the friend who just came online
						if (ws && discordUserId) {
							const myLogs = await loadLogsFromDisk();
							if (myLogs.length > 0) {
								console.log('[WebSocket] 📤 Sending', myLogs.length, 'logs to', message.userId);
								await ws.send(
									JSON.stringify({
										type: 'sync_logs',
										targetUserId: message.userId,
										logs: myLogs
									})
								);
							}
						}
					}
				}
			});

			apiSubscribe('user_offline', (message: any) => {
				if (message.userId) {
					const friendIndex = friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						friendsList = [
							...friendsList.slice(0, friendIndex),
							{ ...friendsList[friendIndex], isOnline: false },
							...friendsList.slice(friendIndex + 1)
						];
					}
				}
			});

			// Connect using API module (subscriptions are now set up)
			const socket = await apiConnectWebSocket(discordUserId);
			ws = socket;

			connectionStatus = 'connected';
			connectionError = null;
			reconnectAttempts = 0;
			if (reconnectTimer) {
				clearTimeout(reconnectTimer);
				reconnectTimer = null;
			}

			return Promise.resolve();
		} catch (error) {
			console.error('[WebSocket] Failed to connect:', error);
			connectionStatus = 'disconnected';
			connectionError = 'Failed to connect to server. Retrying...';
			ws = null;
			autoConnectionAttempted = false;

			friendsList = friendsList.map((friend) => ({ ...friend, isOnline: false }));
			saveFriendsListToStore();
			return Promise.reject(error instanceof Error ? error : new Error('Failed to connect'));
		}
	}

	async function handleWebSocketMessage(msg: any) {
		try {
			// Handle different message types from Tauri WebSocket
			let messageData: string;

			if (typeof msg === 'string') {
				messageData = msg;
			} else if (msg.data && typeof msg.data === 'string') {
				messageData = msg.data;
			} else if (msg.type === 'Text' && msg.data) {
				messageData = msg.data;
			} else {
				console.log('[WebSocket] Received non-text message:', msg);
				return;
			}

			const message = JSON.parse(messageData);

			switch (message.type) {
				case 'welcome':
					console.log('[WebSocket] ✅ Received welcome message from server');
					break;
				case 'registered':
					console.log('[WebSocket] ✅ Successfully registered with server as:', discordUserId);
					// Initial sync after registration
					await syncUserProfileFromAPI(); // Fetch friend code first
					await syncFriendsFromAPI();
					await syncFriendRequestsFromAPI();
					break;
				case 'registration_success':
					console.log('[WebSocket] ✅ Successfully registered with server');
					break;
				case 'refetch_friends':
					console.log('[WebSocket] 🔄 Received refetch_friends notification');
					await syncFriendsFromAPI();
					break;
				case 'refetch_friend_requests':
					console.log('[WebSocket] 🔄 Received refetch_friend_requests notification');
					await syncFriendRequestsFromAPI();
					break;
				case 'user_online':
					// Update friend's online status
					if (message.userId) {
						const friendIndex = friendsList.findIndex((f) => f.id === message.userId);
						if (friendIndex !== -1) {
							friendsList = [
								...friendsList.slice(0, friendIndex),
								{ ...friendsList[friendIndex], isOnline: true },
								...friendsList.slice(friendIndex + 1)
							];
						}
					}
					break;
				case 'user_offline':
					// Update friend's offline status
					if (message.userId) {
						const friendIndex = friendsList.findIndex((f) => f.id === message.userId);
						if (friendIndex !== -1) {
							friendsList = [
								...friendsList.slice(0, friendIndex),
								{ ...friendsList[friendIndex], isOnline: false },
								...friendsList.slice(friendIndex + 1)
							];
						}
					}
					break;

				// Legacy handlers - can be removed after migration
				case 'auto_initiate_offer':
					// Deprecated - no longer used
					break;
				case 'auto_expect_offer':
					// Deprecated - no longer used
					break;
				case 'friend_request_received':
					// Deprecated - now handled via API and refetch_friend_requests notification
					console.log('[WebSocket] Received legacy friend_request_received message - use API instead');
					break;
				case 'friend_request_accepted_notice':
					// Deprecated - now handled via API and refetch notifications
					console.log('[WebSocket] Received legacy friend_request_accepted_notice - use API instead');
					break;
				case 'friend_added_notice':
					// Deprecated - now handled via API and refetch_friends notification
					console.log('[WebSocket] Received legacy friend_added_notice - use API instead');
					break;
				case 'friend_request_denied_notice':
					// Deprecated - now handled via API
					console.log('[WebSocket] Received legacy friend_request_denied_notice - use API instead');
					break;
				case 'friend_request_error':
					// Deprecated - errors now come from API responses
					console.log('[WebSocket] Received legacy friend_request_error - use API instead');
					break;
				case 'user_came_online':
					if (message.userData && message.userData.id !== playerId) {
						const friendId = message.userData.id;
						const friendIndex = friendsList.findIndex((f) => f.id === friendId);
						if (friendIndex !== -1) {
							const oldFriendData = friendsList[friendIndex];
							friendsList = [
								...friendsList.slice(0, friendIndex),
								{
									...oldFriendData,
									isOnline: true,
									name: message.userData.playerName || oldFriendData.name,
									timezone: message.userData.timezone || oldFriendData.timezone
								},
								...friendsList.slice(friendIndex + 1)
							];
							saveFriendsListToStore();
							// Send our logs to the friend who just came online
							if (ws && playerId && friendId) {
								const myLogs = await loadLogsFromDisk();
								await ws.send(
									JSON.stringify({
										type: 'sync_logs',
										targetUserId: friendId,
										logs: myLogs
									})
								);
							}
						}
					}
					break;
				case 'friend_details_updated':
					if (message.userData && message.userData.id !== playerId) {
						const friendIndex = friendsList.findIndex((f) => f.id === message.userData.id);
						if (friendIndex !== -1) {
							friendsList = [
								...friendsList.slice(0, friendIndex),
								{
									...friendsList[friendIndex],
									name: message.userData.playerName || friendsList[friendIndex].name,
									timezone: message.userData.timezone || friendsList[friendIndex].timezone,
									friendCode: message.userData.friendCode || friendsList[friendIndex].friendCode
								},
								...friendsList.slice(friendIndex + 1)
							];
							saveFriendsListToStore();
						}
					}
					break;
				case 'user_disconnected':
					if (message.userId) {
						const friendId = message.userId;
						const friendIndex = friendsList.findIndex((f) => f.id === friendId);
						if (friendIndex !== -1) {
							friendsList = [
								...friendsList.slice(0, friendIndex),
								{ ...friendsList[friendIndex], isOnline: false },
								...friendsList.slice(friendIndex + 1)
							];
							saveFriendsListToStore();
						}
					}
					break;
				case 'error':
					break;
				case 'auth_complete':
					if (message.data?.user && message.data?.tokens) {
						console.log('[WebSocket] Received auth_complete message');
						handleAuthComplete(message.data);
					}
					break;
				case 'log':
					if (message.log) {
						const log = message.log;
						// Only show logs from friends or yourself
						const isFromFriend = friendsList.some(
							(friend) => friend.id === log.userId && friend.status === 'confirmed'
						);
						const isFromMe = log.userId === playerId;
						if (isFromFriend || isFromMe) {
							let groupedLogs = dedupeAndSortLogs([...fileContent, log]);
							groupedLogs = groupKillingSprees(groupedLogs);
							fileContent = groupedLogs;
							appendLogToDisk(log); // Save to disk
						}
					}
					break;
				case 'friend_request_pending':
					// Deprecated - friend requests are now handled via API
					console.log('[WebSocket] Received legacy friend_request_pending message - use API instead');
					break;
				case 'friend_removed':
					if (message.userId) {
						friendsList = friendsList.filter((f) => f.id !== message.userId);
						saveFriendsListToStore();
					}
					break;
				case 'sync_logs':
					if (message.logs && Array.isArray(message.logs)) {
						// Merge, dedupe, and save logs
						const localLogs = await loadLogsFromDisk();
						let allLogs = dedupeAndSortLogs([...localLogs, ...message.logs]);
						allLogs = groupKillingSprees(allLogs);
						await saveLogsToDisk(allLogs);
						fileContent = allLogs;
					}
					break;
				default:
			}
		} catch (e) {
			console.error('[WebSocket] Error handling message:', e);
		}
	}

	onMount(() => {
		let unlisten: (() => void) | null = null;

		// Async initialization
		(async () => {
			// Load authentication data
			const authData = await loadAuthData();
			if (authData) {
				isSignedIn = true;
				discordUser = {
					id: authData.user.id,
					username: authData.user.global_name || authData.user.username,
					avatar: authData.user.avatar
				};
			}

			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			const savedFile = await store.get<string>('lastFile');
			const savedFriendsList = await store.get<FriendType[]>('friendsList');
			const savedPlayerName = await store.get<string>('playerName');
			const savedEnvironment = await store.get<'LIVE' | 'PTU' | 'HOTFIX'>(
				'selectedEnvironment'
			);

			// Set file path immediately to prevent welcome screen flash
			if (savedFile) {
				file = savedFile;
				logLocation = savedFile.split('/').slice(-2, -1)[0] || null;
			}

			if (savedEnvironment) {
				selectedEnvironment = savedEnvironment;
			}

			if (savedPlayerName) {
				playerName = savedPlayerName;
			}

			if (savedFriendsList) {
				friendsList = savedFriendsList.map((friend) => ({ ...friend, isOnline: false }));
			}

			// Load Discord authentication state
			const storedDiscordUserId = await store.get<string>('discordUserId');
			if (storedDiscordUserId) {
				discordUserId = storedDiscordUserId;
				console.log('[Init] Loaded Discord user ID:', discordUserId);

				// Load Discord user data from auth store
				const authData = await loadAuthData();
				if (authData) {
					isSignedIn = true;
					discordUser = {
						id: authData.user.id,
						username: authData.user.global_name || authData.user.username,
						avatar: authData.user.avatar
					};
					console.log('[Init] Restored Discord auth session');
				}
			}


			await store.save();

			// Load the Game.log file if previously selected
			if (savedFile && file) {
				try {
					// Load existing logs from disk
					const savedLogs = await loadLogsFromDisk();
					fileContent = savedLogs;

					// Always re-parse the entire Game.log to ensure we have all logs
					// This handles cases where logs.json might be out of sync
					prevLineCount = 0;
					lineCount = 0;
					await handleFile(file);

					handleInitialiseWatch(file);
					// playerId will be extracted from Game.log when parsing
				} catch (error) {}
			}

			// Mark loading complete
			isLoadingFile = false;

			// Connect WebSocket only if signed in with Discord AND have JWT token
			// (this will trigger syncs after registration via the 'registered' event)
			if (isSignedIn && discordUserId && !ws) {
				// Check if we have a JWT token before attempting to connect
				const authData = await loadAuthData();
				const jwtToken = await getJwtToken();

				if (jwtToken) {
					connectWebSocket();
				} else {
					console.log('[Init] No JWT token found - user needs to sign in again');
					connectionError = 'Authentication expired - please sign in again';
					// Sign out to clear old auth data
					await handleSignOut();
				}
			}

			check().then((update: any) => {
				if (update?.available) {
					updateInfo = update;
				}
			});

			// Setup deep link listener for OAuth callbacks
			unlisten = await onOpenUrl(async (urls) => {
				console.log('[Deep Link] Received URLs:', urls);

				for (const url of urls) {
					try {
						console.log('[Deep Link] Processing URL:', url);
						const urlObj = new URL(url);
						console.log('[Deep Link] Protocol:', urlObj.protocol, 'Hostname:', urlObj.hostname);

						// Handle picologs://auth?data=...
						if (urlObj.protocol === 'picologs:' && urlObj.hostname === 'auth') {
							console.log('[Deep Link] Matched auth protocol');
							const authDataEncoded = urlObj.searchParams.get('data');
							console.log('[Deep Link] Auth data encoded:', authDataEncoded ? 'Yes' : 'No');
							if (authDataEncoded) {
								const authData = JSON.parse(decodeURIComponent(authDataEncoded));
								console.log('[Deep Link] Parsed auth data:', authData);
								await handleAuthComplete(authData);
								console.log('[Deep Link] Auth complete handled');
							}
						} else {
							console.log('[Deep Link] URL did not match expected format');
						}
					} catch (error) {
						console.error('[Deep Link] Error parsing URL:', error);
					}
				}
			});
			// Add scroll event listener
			if (fileContentContainer) {
				fileContentContainer.addEventListener('scroll', handleScroll, { passive: true });
			}
		})();

		// Cleanup on unmount
		return () => {
			if (unlisten) {
				unlisten();
			}
			if (fileContentContainer) {
				fileContentContainer.removeEventListener('scroll', handleScroll);
			}
		};
	});

	let endWatch: () => void;

	async function handleInitialiseWatch(filePath: string) {
		if (endWatch) {
			endWatch();
		}
		endWatch = await watchImmediate(
			filePath,
			(event) => {
				handleFile(filePath);
			},
			{ recursive: false }
		);
	}

	function parseLogTimestamp(raw: string): string {
		// Example: 2024.06.07-12:34:56:789
		const match = raw.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2}):(\d{2}):(\d{2}):?(\d{0,3})?/);
		if (!match) return new Date().toISOString();
		const [_, year, month, day, hour, min, sec, ms] = match;
		const msStr = ms ? ms.padEnd(3, '0') : '000';
		return `${year}-${month}-${day}T${hour}:${min}:${sec}.${msStr}Z`;
	}

	async function handleFile(filePath: string | null) {
		if (!filePath) return;

		try {
			tick = 0;
			const pathParts = filePath.split('\\');
			logLocation =
				pathParts.length > 1
					? pathParts[pathParts.length - 2]
					: filePath.split('/').length > 1
						? filePath.split('/').slice(-2, -1)[0]
						: null;

			const linesText = await readTextFile(filePath);
			const lineBreak = linesText.split('\n');
			const currentLineCount = lineBreak.length;

			// If file was truncated (e.g., new game session), reset
			if (currentLineCount < prevLineCount) {
				prevLineCount = 0;
				lineCount = 0;
				fileContent = [];
			}

			// No new lines to process
			if (currentLineCount <= prevLineCount) {
				return;
			}

			// Process only new lines since last read
			const newLines = lineBreak.slice(prevLineCount, currentLineCount);
			const newLinesCount = currentLineCount - prevLineCount;
			prevLineCount = currentLineCount;
			lineCount += newLinesCount;

			const newContent = newLines
				.map((line) => {
					if (!line.trim()) return null;

					const timestampMatch = line.match(/<([^>]+)>/);
					let timestamp = new Date().toISOString();
					if (timestampMatch) {
						const raw = timestampMatch[1];
						// If it's a valid ISO string, use it directly
						if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) {
							timestamp = raw;
						} else {
							timestamp = parseLogTimestamp(raw);
						}
					}
					if (
						onlyProcessLogsAfterThisDateTimeStamp &&
						new Date(timestamp).getTime() < onlyProcessLogsAfterThisDateTimeStamp
					) {
						return null;
					}
					let logEntry: Log | null = null;

					if (line.match(/AccountLoginCharacterStatus_Character/)) {
						const nameMatch = line.match(/- name (.*?) /);
						const oldPlayerName = playerName;
						playerName = nameMatch ? nameMatch[1] : playerName;

						// Extract Star Citizen player ID from EntityId if not already set
						if (!playerId && line.includes('EntityId')) {
							const entityIdMatch = line.match(/EntityId\[(.*?)\]/);
							if (entityIdMatch) {
								playerId = entityIdMatch[1];
								console.log('[Log] Extracted Star Citizen player ID from log:', playerId);
							}
						}

						if (playerName && playerName !== oldPlayerName) {
							if (ws && discordUserId) {
								// Fire-and-forget WebSocket send (don't block log parsing)
								ws.send(
									JSON.stringify({
										type: 'update_my_details',
										userId: discordUserId, // Use Discord ID for WebSocket
										playerName: playerName,
										playerId: playerId, // Include SC player ID as metadata
										timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
									})
								).catch((error: any) => {
									console.error('[WebSocket] Error sending update_my_details:', error);
								});
							}
						}
						logEntry = {
							id: generateId(),
							userId: playerId!,
							player: playerName,
							emoji: '🛜',
							line: `${playerName || 'Player'} connected to the game`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<RequestLocationInventory>/)) {
						const playerMatch = line.split('Player[')[1]?.split(']')[0];
						const locationMatch = line.split('Location[')[1]?.split(']')[0];
						if (playerMatch === playerName && locationMatch) {
							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🔍',
								line: `${playerName} requested inventory in ${locationMatch}`,
								timestamp,
								original: line,
								open: false
							};
						}
					} else if (
						playerName &&
						line.match(/<Actor Death>/) &&
						line.match(`CActor::Kill: '${playerName}'`)
					) {
						const regex =
							/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
						const match = line.match(regex);

						if (match) {
							const victimName = match[1];
							const victimId = match[2];
							const zone = match[3];
							const killerName = match[4];
							const killerId = match[5];
							const weaponInstance = match[6];
							const weaponClass = match[7];
							const damageType = match[8];
							const dirX = match[9];
							const dirY = match[10];
							const dirZ = match[11];

							const displayKillerName = getName(killerName);

							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '😵',
								line: `${playerName} killed by ${displayKillerName}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'actor_death',
								metadata: {
									victimName,
									victimId,
									zone,
									killerName,
									killerId,
									weaponInstance,
									weaponClass,
									damageType,
									direction: { x: dirX, y: dirY, z: dirZ }
								}
							};
						}
					} else if (
						playerName &&
						line.match(/<Actor Death>/) &&
						!line.match(`CActor::Kill: '${playerName}'`)
					) {
						const regex =
							/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
						const match = line.match(regex);

						if (match) {
							const victimName = match[1];
							const victimId = match[2];
							const zone = match[3];
							const killerName = match[4];
							const killerId = match[5];
							const weaponInstance = match[6];
							const weaponClass = match[7];
							const damageType = match[8];
							const dirX = match[9];
							const dirY = match[10];
							const dirZ = match[11];

							const displayVictimName = getName(victimName);
							const displayKillerName = getName(killerName);

							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🗡️',
								line: `${displayVictimName} killed by ${displayKillerName}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'actor_death',
								metadata: {
									victimName,
									victimId,
									zone,
									killerName,
									killerId,
									weaponInstance,
									weaponClass,
									damageType,
									direction: { x: dirX, y: dirY, z: dirZ }
								}
							};
						}
					} else if (line.match(/<Vehicle Destruction>/)) {
						const vehicle = line.match(/Vehicle '(.*?)' \[.*?\]/)?.[1];
						const shipType = getShipType(vehicle || '');
						const destroyer = getName(line.match(/caused by '(.*?)' \[.*?\]/)?.[1] || '');
						const destroyLevelMatch = line.match(/destroyLevel from '(.*?)' to '(.*?)'/);
						logEntry = {
							id: generateId(),
							userId: playerId!,
							player: playerName,
							emoji: '💥',
							line: `${shipType} destroyed by ${destroyer}`,
							timestamp,
							original: line,
							open: false,
							eventType: 'destruction',
							metadata: {
								vehicleName: vehicle,
								causeName: destroyer,
								destroyLevelFrom: destroyLevelMatch?.[1],
								destroyLevelTo: destroyLevelMatch?.[2]
							}
						};
					} else if (line.match(/<Ship Destruction>/)) {
						logEntry = {
							id: generateId(),
							userId: playerId!,
							player: playerName,
							emoji: '💥',
							line: `${playerName || 'Someone'} destroyed a ship`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<SystemQuit>/)) {
						logEntry = {
							id: generateId(),
							userId: playerId!,
							player: playerName,
							emoji: '👋',
							line: `${playerName || 'Player'} quit the game`,
							timestamp,
							original: line,
							open: false
						};
					} else if (line.match(/<Vehicle Control Flow>/)) {
						const shipNameMatch = line.match(/'([A-Za-z0-9_]+)_\d+'/);
						const shipIdMatch = line
							.match(/\[(\d+)\]/g)
							?.pop()
							?.match(/\d+/)?.[0];
						const shipName = shipNameMatch?.[1];
						if (shipName) {
							logEntry = {
								id: generateId(),
								userId: playerId!,
								player: playerName,
								emoji: '🚀',
								line: `${playerName || 'Player'} boarded ${shipName}${shipIdMatch ? ` [${shipIdMatch}]` : ''}`,
								timestamp,
								original: line,
								open: false,
								eventType: 'vehicle_control_flow',
								metadata: {
									vehicleName: shipName
								}
							};
						}
					}
					if (logEntry) {
						// Send via WebSocket if connected
						if (connectionStatus === 'connected') sendLogViaWebSocket(logEntry);
						// Save to disk if signed in (for sharing with friends)
						if (isSignedIn) appendLogToDisk(logEntry);
					}
					return logEntry;
				})
				.filter((item): item is Log => item !== null);

			if (newContent.length > 0) {
				// Ensure all logs have userId (for backward compatibility or future-proofing)
				const newContentWithUserId = newContent.map((log) =>
					log.userId ? log : { ...log, userId: playerId! }
				);
				let groupedLogs = dedupeAndSortLogs([...fileContent, ...newContentWithUserId]);
				groupedLogs = groupKillingSprees(groupedLogs);
				fileContent = groupedLogs;
				setTimeout(() => {
					fileContentContainer?.scrollTo({
						top: fileContentContainer.scrollHeight,
						behavior: 'smooth'
					});
				}, 0);
			}
		} catch (error) {}
	}

	async function selectFile(environment?: 'LIVE' | 'PTU' | 'HOTFIX') {
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});
		const env = environment || selectedEnvironment;
		const defaultPath = environment ? `C:\\Program Files\\Roberts Space Industries\\StarCitizen\\${env}\\` : undefined;

		const selectedPath = await open({
			multiple: false,
			directory: false,
			filters: [{ name: 'Game.log', extensions: ['log'] }],
			defaultPath
		});

		if (typeof selectedPath === 'string' && selectedPath) {
			file = selectedPath;
			fileContent = [];
			prevLineCount = 0;
			onlyProcessLogsAfterThisDateTimeStamp = null;
			await store.set('lastFile', selectedPath);

			// Store the environment
			if (environment) {
				selectedEnvironment = environment;
				await store.set('selectedEnvironment', environment);
			}

			let storedPlayerId = await store.get<string>('id');
			if (!storedPlayerId) {
				const pathPartsForId = selectedPath.split('/');
				playerId = pathPartsForId.length > 1 ? pathPartsForId.slice(-2, -1)[0] : generateId();
				await store.set('id', playerId);
			}
			await store.save();

			await handleFile(selectedPath);
			await handleInitialiseWatch(selectedPath);

			if (!ws && playerId) {
				connectWebSocket();
			}
		}
	}

	async function clearSettings() {
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});

		// Save Discord auth before clearing
		const savedDiscordUserId = await store.get<string>('discordUserId');

		await store.clear();
		await store.delete('friendsList');
		await store.delete('lastFile');
		await store.delete('playerName');

		// Restore Discord auth
		if (savedDiscordUserId) {
			await store.set('discordUserId', savedDiscordUserId);
		}

		await store.save();

		file = null;
		fileContent = [];
		playerName = null;
		logLocation = null;
		prevLineCount = 0;
		lineCount = 0;
		playerId = null; // Will be re-extracted from Game.log
		friendsList = [];
		currentUserDisplayData = null;
		autoConnectionAttempted = false;

		console.log('[Reset] Data reset complete, Discord auth preserved');

		// Reconnect WebSocket if signed in
		if (ws) {
			try {
				await ws.disconnect();
			} catch (error) {
				console.error('[WebSocket] Error disconnecting:', error);
			}
		}
		connectionStatus = 'disconnected';

		if (isSignedIn && discordUserId) {
			connectWebSocket();
		}
	}

	let fileContentContainer = $state<HTMLDivElement | null>(null);
	let atTheBottom = $state(true);
	let hasScrollbar = $state(false);

	function handleScroll(event: Event) {
		if (!(event.target instanceof HTMLDivElement)) {
			return;
		}
		const target = event.target;
		const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 5;
		const hasContent = target.scrollHeight > target.clientHeight;

		hasScrollbar = hasContent;
		atTheBottom = isAtBottom;
	}

	const shipTypes = [
		'325a',
		'c1',
		'a2',
		'warlock',
		'eclipse',
		'inferno',
		'85x',
		'mantis',
		'hornet',
		'fury',
		'spirit_a1',
		'spirit_c1',
		'400i',
		'c2',
		'firebird',
		'reclaimer',
		'polaris',
		'comet',
		'gladius',
		'lightning',
		'scorpius',
		'arrow',
		'c8r',
		'c8x',
		'hull_c',
		'ursa_medivac',
		'starlancer_max',
		'mole',
		'starfighter',
		'ballista',
		'starfarer',
		'carrack',
		'taurus',
		'atls',
		'm50',
		'sabre',
		'dragonfly_yellow',
		'corsair',
		'cutlass_red',
		'prospector',
		'srv',
		'constellation',
		'freelancer',
		'archimedes',
		'avenger',
		'vulture',
		'cutter',
		'nomad',
		'cutlass',
		'350r',
		'razor',
		'890jump',
		'starlifter',
		'caterpillar',
		'vanguard',
		'reliant',
		'buccaneer',
		'glaive',
		'scythe',
		'600i',
		'talon'
	];

	function getShipType(shipName: string) {
		if (!shipName) return 'Unknown Ship';
		return (
			shipTypes.find((type) => shipName.toLowerCase().includes(type.toLowerCase())) || shipName
		);
	}

	function getName(line: string) {
		if (!line) return 'Unknown';
		if (line.includes('unknown')) {
			return '🤷‍♂️ Unknown';
		}
		return line.includes('PU_') ? '🤖 NPC' : line;
	}

	async function saveFriendsListToStore() {
		try {
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.set('friendsList', friendsList);
			await store.save();
		} catch (error) {}
	}

	function addFriendToList(newFriend: any) {
		const mappedFriend: FriendType = {
			id: newFriend.id,
			friendCode: newFriend.friendCode,
			name: newFriend.playerName || newFriend.name || newFriend.friendCode,
			status: newFriend.status || 'confirmed',
			timezone: newFriend.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			isOnline: newFriend.isOnline !== undefined ? newFriend.isOnline : false,
			isConnected: false
		};

		// Find by id or friendCode (to catch pending entries with only friendCode)
		const existingFriendIndex = friendsList.findIndex(
			(f) => f.id === mappedFriend.id || f.friendCode === mappedFriend.friendCode
		);

		if (existingFriendIndex !== -1) {
			// Always update the entry to the new data if confirmed
			if (mappedFriend.status === 'confirmed') {
				friendsList = [
					...friendsList.slice(0, existingFriendIndex),
					{
						...friendsList[existingFriendIndex],
						...mappedFriend,
						status: 'confirmed',
						isOnline: mappedFriend.isOnline
					},
					...friendsList.slice(existingFriendIndex + 1)
				];
				saveFriendsListToStore();
			}
		} else {
			friendsList = [...friendsList, mappedFriend];
			saveFriendsListToStore();
		}
	}

	async function handleAddFriend(friendCode: string) {
		if (!isSignedIn) {
			alert('Please sign in with Discord to add friends');
			return;
		}

		console.log('[Friend] Sending friend request to:', friendCode);
		const success = await apiSendFriendRequest(friendCode);

		if (success) {
			console.log('[Friend] Friend request sent successfully');
			// API will trigger refetch_friend_requests notification
		} else {
			alert('Failed to send friend request. Please check the friend code and try again.');
		}
	}


	async function handleRemoveFriend(id: string) {
		if (!isSignedIn) {
			alert('Please sign in with Discord to remove friends');
			return;
		}

		// Find the friendship ID from apiFriends
		const apiFriend = apiFriends.find((f) => f.friendUserId === id);
		if (!apiFriend) {
			console.error('[Friend] Cannot remove friend - friendship not found');
			return;
		}

		console.log('[Friend] Removing friend:', id);
		const success = await apiRemoveFriend(apiFriend.id);

		if (success) {
			console.log('[Friend] Friend removed successfully');
			// API will trigger refetch_friends notification
		} else {
			alert('Failed to remove friend. Please try again.');
		}
	}

</script>

<main class="p-0 text-white grid grid-cols-1 grid-rows-[auto_1fr] h-dvh overflow-hidden">
	<Header
		friendCode={apiUserProfile?.friendCode}
		{connectWebSocket}
		{connectionStatus}
		{copiedStatusVisible}
		{selectFile}
		bind:logLocation
		{clearLogs}
		{updateInfo}
		{installUpdate}
		{isSignedIn}
		{discordUser}
		{handleSignIn}
		{handleSignOut}
		{connectionError} />

	<div class="flex flex-col overflow-hidden">
		{#if isSignedIn && discordUser}
			<Resizer>
				{#snippet leftPanel()}
					<div class="flex flex-col overflow-y-hidden h-full">
						<div class="flex flex-col gap-4 overflow-y-auto flex-grow px-2 pb-2 pt-0">
							{#if currentUserDisplayData}
								<User user={currentUserDisplayData} />
							{/if}
							<Friends {friendsList} removeFriend={handleRemoveFriend} />
						</div>
						<div class="mt-auto min-w-[200px] px-2 pb-2">
							<AddFriend addFriend={handleAddFriend} />
						</div>
					</div>
				{/snippet}

				{#snippet rightPanel()}
					<div class="relative grid grid-rows-[1fr_auto] h-full overflow-hidden">
						<div
							class="row-start-1 row-end-2 overflow-y-auto flex flex-col bg-black/10 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]"
							bind:this={fileContentContainer}>
							{#if file}
								{#each fileContent as item, index (item.id)}
									<Item {...item} bind:open={item.open} />
									{#if item.open && item.children && item.children.length > 0}
										<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
											{#each item.children as child (child.id)}
												<Item {...child} bind:open={child.open} child={true} />
											{/each}
										</div>
									{/if}
								{:else}
									<div class="flex items-start gap-4 px-4 py-3 border-b border-white/5">
										<div class="flex flex-col gap-[0.3rem]">
											<div class="text-[0.95rem] flex items-center gap-2 leading-[1.4]">
												No new logs yet. Waiting for game activity...
											</div>
										</div>
									</div>
								{/each}
							{:else if !isLoadingFile}
								<div
									class="flex flex-col items-start gap-4 my-8 mx-auto p-8 rounded-lg bg-white/[0.03] border border-white/10 max-w-[600px]">
									<h2 class="m-0 mb-2 text-[1.6rem] font-medium">🚀 Getting started</h2>
									<ol class="list-none pl-0 [counter-reset:welcome-counter] flex flex-col gap-2 mt-4">
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											Select your <code
												class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
												Game.log
											</code>
											file. Usually found at the default path:
											<code
												class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
												C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log
											</code>
											<br />
											(Or the equivalent path on your system if installed elsewhere.)
										</li>
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											Once a log file is selected and you go <strong>Online</strong>
											(using the top-right button), Picologs automatically connects you with other friends for
											real-time log sharing.
										</li>
										<li
											class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
											To add friends use your <strong>Friend Code</strong>
											displayed at the top. Share this with friends to connect with them.
										</li>
									</ol>
								</div>
							{/if}
						</div>

						{#if file}
							<div
								class="row-start-2 row-end-3 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
								Log lines processed: {Number(lineCount).toLocaleString()}
							</div>
						{/if}

						<!-- Scroll to bottom button -->
						{#if hasScrollbar && !atTheBottom}
							<button
								in:fade={{ duration: 200, delay: 400 }}
								out:fade={{ duration: 200 }}
								class="absolute bottom-[70px] w-10 h-10 rounded-full bg-white/10 border border-white/20 backdrop-blur-[10px] shadow-[0_0_10px_rgba(0,0,0,0.1)] flex items-center justify-center text-white cursor-pointer z-50"
								style="left: 50%; transform: translateX(-50%);"
								onclick={() =>
									fileContentContainer?.scrollTo({
										top: fileContentContainer.scrollHeight,
										behavior: 'smooth'
									})}>
								<ArrowDown size={24} />
							</button>
						{/if}
					</div>
				{/snippet}
			</Resizer>
		{:else}
			<div class="relative grid grid-rows-[1fr_auto] h-[calc(100dvh-70px)] overflow-hidden">
				<div
					class="row-start-1 row-end-2 overflow-y-auto flex flex-col bg-black/10 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]"
					bind:this={fileContentContainer}>
					{#if file}
						{#each fileContent as item, index (item.id)}
							<Item {...item} bind:open={item.open} />
							{#if item.open && item.children && item.children.length > 0}
								<div class="relative ml-16 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[2px] before:bg-gradient-to-b before:from-red-500/50 before:via-red-500/30 before:to-transparent">
									{#each item.children as child (child.id)}
										<Item {...child} bind:open={child.open} child={true} />
									{/each}
								</div>
							{/if}
						{:else}
							<div class="flex items-start gap-4 px-4 py-3 border-b border-white/5">
								<div class="flex flex-col gap-[0.3rem]">
									<div class="text-[0.95rem] flex items-center gap-2 leading-[1.4]">
										No new logs yet. Waiting for game activity...
									</div>
								</div>
							</div>
						{/each}
					{:else if !isLoadingFile}
						<div
							class="flex flex-col items-start gap-4 my-8 mx-auto p-8 rounded-lg bg-white/[0.03] border border-white/10 max-w-[600px]">
							<h2 class="m-0 mb-2 text-[1.6rem] font-medium">🚀 Getting started</h2>
							<ol class="list-none pl-0 [counter-reset:welcome-counter] flex flex-col gap-2 mt-4">
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									Select your <code
										class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
										Game.log
									</code>
									file. Usually found at the default path:
									<code
										class="bg-white/10 px-[0.3rem] py-[0.1rem] rounded-[3px] font-mono inline text-base">
										C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log
									</code>
									<br />
									(Or the equivalent path on your system if installed elsewhere.)
								</li>
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									Once a log file is selected and you go <strong>Online</strong>
									(using the top-right button), Picologs automatically connects you with other friends for
									real-time log sharing.
								</li>
								<li
									class="inline-block relative pl-[34px] m-0 text-base font-light leading-[1.6] before:content-[counter(welcome-counter)] before:[counter-increment:welcome-counter] before:absolute before:left-0 before:top-0 before:w-6 before:h-6 before:bg-[#4caf50] before:text-white before:rounded-full before:inline-flex before:items-center before:justify-center before:text-[0.85em] before:font-bold before:leading-6">
									To add friends use your <strong>Friend Code</strong>
									displayed at the top. Share this with friends to connect with them.
								</li>
							</ol>
						</div>
					{/if}
				</div>

				{#if file}
					<div
						class="row-start-2 row-end-3 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
						Log lines processed: {Number(lineCount).toLocaleString()}
					</div>
				{/if}

				<!-- Scroll to bottom button -->
				{#if hasScrollbar && !atTheBottom}
					<button
						in:fade={{ duration: 200, delay: 400 }}
						out:fade={{ duration: 200 }}
						class="absolute bottom-[70px] w-10 h-10 rounded-full bg-white/10 border border-white/20 backdrop-blur-[10px] shadow-[0_0_10px_rgba(0,0,0,0.1)] flex items-center justify-center text-white cursor-pointer z-50"
						style="left: 50%; transform: translateX(-50%);"
						onclick={() =>
							fileContentContainer?.scrollTo({
								top: fileContentContainer.scrollHeight,
								behavior: 'smooth'
							})}>
						<ArrowDown size={24} />
					</button>
				{/if}
			</div>
		{/if}

		<!-- OTP Input Modal -->
		{#if awaitingOtp}
			<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
				<div class="bg-[rgb(10,30,42)] border border-white/20 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
					{#if isVerifyingOtp}
						<div class="flex flex-col items-center justify-center py-8">
							<div class="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mb-4"></div>
							<h2 class="text-xl font-medium text-white mb-2">Signing you in...</h2>
							<p class="text-white/70 text-sm">Please wait while we verify your code</p>
						</div>
					{:else}
						<h2 class="text-2xl font-medium mb-4 text-white">Enter Authentication Code</h2>
						<p class="text-white/70 mb-6">Enter the 6-digit code from your browser:</p>

						<input
							type="text"
							bind:value={otpCode}
							placeholder="000000"
							maxlength="6"
							class="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white text-center text-2xl tracking-widest font-mono mb-4 focus:outline-none focus:border-blue-500"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									submitOtp();
								}
							}}
						/>

						{#if authError}
							<div class="bg-red-900/20 border border-red-500/50 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
								{authError}
							</div>
						{/if}

						<div class="flex gap-3">
							<button
								onclick={() => {
									awaitingOtp = false;
									otpCode = '';
									authError = null;
								}}
								class="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white hover:bg-white/10 transition-colors">
								Cancel
							</button>
							<button
								onclick={submitOtp}
								disabled={otpCode.length !== 6}
								class="flex-1 px-4 py-2 bg-blue-600 border border-blue-500 rounded-lg text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
								Verify
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	:global(.item:nth-child(2n)) {
		background-color: rgba(255, 255, 255, 0.05);
	}
</style>
