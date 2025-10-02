<script lang="ts">
	import { readTextFile, watchImmediate, writeFile } from '@tauri-apps/plugin-fs';
	import { load } from '@tauri-apps/plugin-store';
	import { open } from '@tauri-apps/plugin-dialog';
	import Item from '../components/Item.svelte';
	import { onMount } from 'svelte';
	import Friends from '../components/Friends.svelte';
	import User from '../components/User.svelte';
	import AddFriend from '../components/AddFriend.svelte';
	import type { Log, Friend as FriendType } from '../types';
	import { appDataDir } from '@tauri-apps/api/path';
	import Header from '../components/Header.svelte';
	import PendingFriendRequests from '../components/PendingFriendRequests.svelte';
	import { ask } from '@tauri-apps/plugin-dialog';
	import { check } from '@tauri-apps/plugin-updater';
	import { loginWithDiscord, loadAuthData, signOut, handleAuthComplete } from '$lib/oauth';
	import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

	// Authentication state
	let isSignedIn = $state(false);
	let discordUser = $state<{ id: string; username: string; avatar: string | null } | null>(null);
	let discordUserId = $state<string | null>(null); // Discord user ID for WebSocket auth

	let ws = $state<WebSocket | null>(null);
	let file = $state<string | null>(null);
	let fileContent = $state<Log[]>([]);
	let friendCode = $state<string | null>(null);
	let playerName = $state<string | null>(null);
	let playerId = $state<string | null>(null); // Star Citizen player ID from Game.log
	let tick = $state(0);
	let logLocation = $state<string | null>(null);
	let selectedEnvironment = $state<'LIVE' | 'PTU' | 'HOTFIX'>('LIVE');
	let prevLineCount = $state<number>(0);
	let lineCount = $state<number>(0);
	let connectionStatus = $state<'connected' | 'disconnected' | 'connecting'>('disconnected');
	let copiedStatusVisible = $state(false);
	let pendingFriendRequests = $state<{ friendCode: string }[]>([]);
	let autoConnectionAttempted = $state(false);
	let reconnectAttempts = $state(0);
	let reconnectTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	const MAX_RECONNECT_ATTEMPTS = 5;
	let connectionError = $state<string | null>(null);
	let friendsList = $state<FriendType[]>([]);
	let pendingFriendRequest = $state<{
		fromUserId: string;
		fromFriendCode: string;
		fromPlayerName?: string;
		fromTimezone?: string;
	} | null>(null);
	let currentUserDisplayData = $state<FriendType | null>(null);
	let lastPendingRequestId = $state<string | null>(null);
	let updateInfo = $state<any>(null);

	function disconnectWebSocket() {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
		connectionStatus = 'disconnected';
		ws = null;
	}

	async function installUpdate() {
		if (updateInfo) {
			await updateInfo.downloadAndInstall();
		}
	}

	// Authentication functions
	async function handleSignIn() {
		// Ensure friendCode exists
		if (!friendCode) {
			friendCode = crypto.randomUUID().substring(0, 6);
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.set('friendCode', friendCode);
			await store.save();
			console.log('[Auth] Generated friend code:', friendCode);
		}

		// Generate a temporary ID for OAuth callback if no Discord ID yet
		const tempAuthId = discordUserId || crypto.randomUUID();

		console.log('[Auth] Starting OAuth flow with temp ID:', tempAuthId);

		// Connect to WebSocket FIRST so we can receive auth_complete message
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			// Temporarily set discordUserId so WebSocket can connect
			const originalDiscordUserId = discordUserId;
			discordUserId = tempAuthId;

			try {
				await connectWebSocket();
				console.log('[Auth] WebSocket connected, ready to receive auth callback');
			} catch (error) {
				console.error('[Auth] Failed to connect WebSocket:', error);
				discordUserId = originalDiscordUserId;
				alert('Failed to connect to server. Please try again.');
				return;
			}
		}

		try {
			const { user, tokens } = await loginWithDiscord(tempAuthId);

			// Store Discord authentication
			discordUserId = user.id; // Use Discord's user ID
			isSignedIn = true;
			discordUser = {
				id: user.id,
				username: user.global_name || user.username,
				avatar: user.avatar
			};

			console.log('[Auth] Successfully authenticated:', user.username);
			console.log('[Auth] Discord user ID:', discordUserId);

			// Save Discord user ID to store
			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.set('discordUserId', discordUserId);
			await store.save();

			// Reconnect WebSocket with real Discord ID
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
			await connectWebSocket();
		} catch (error) {
			console.error('Authentication failed:', error);
			alert(`Sign in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close();
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
		prevLineCount = 0;
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
		for (const log of logs) {
			if (spreeParents.has(log.id)) {
				finalLogs.push(spreeParents.get(log.id)!);
			} else if (!childLogIds.has(log.id)) {
				finalLogs.push(log);
			}
		}

		return finalLogs;
	}

	function sendLogViaWebSocket(log: Log) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify({ type: 'log', log }));
			console.log('Sent log via WebSocket:', log);
		}
	}

	async function connectWebSocket(): Promise<void> {
		// Need at least a discordUserId to connect (can be temporary for OAuth)
		if (!discordUserId) {
			console.log('[WebSocket] Not connecting - no user ID available');
			connectionError = 'Please sign in with Discord to connect';
			return Promise.reject(new Error('No user ID available'));
		}

		if (ws && ws.readyState === WebSocket.OPEN) {
			return Promise.resolve();
		}

		// Clear any existing reconnection timer
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}

		connectionStatus = 'connecting';
		connectionError = null;

		return new Promise((resolve, reject) => {
			try {
				// Use local WebSocket server for development
				const wsUrl = import.meta.env.DEV
					? 'ws://localhost:8080/ws'
					: 'wss://picologs-server.fly.dev/ws';
				console.log('[WebSocket] Connecting to:', wsUrl);
				const socket = new WebSocket(wsUrl);
				ws = socket;

				socket.onopen = () => {
					connectionStatus = 'connected';
					connectionError = null;
					reconnectAttempts = 0;
					if (reconnectTimer) {
						clearTimeout(reconnectTimer);
						reconnectTimer = null;
					}
					console.log('[WebSocket] Connected, registering with Discord user ID:', discordUserId);
					try {
						if (discordUserId && friendCode) {
							socket.send(
								JSON.stringify({
									type: 'register',
									userId: discordUserId, // Use Discord user ID instead of Star Citizen player ID
									friendCode: friendCode,
									playerName: playerName || playerId, // Use SC player ID as display name if no custom name
									timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
								})
							);
						} else {
							console.log('[WebSocket] Cannot register - missing discordUserId or friendCode');
						}
					} catch (sendError) {
						console.error('[WebSocket] Registration error:', sendError);
					}
					resolve();
				};

			socket.onmessage = async (event) => {
				if (typeof event.data === 'string') {
					try {
						const message = JSON.parse(event.data);

						switch (message.type) {
							case 'welcome':
								console.log('[WebSocket] ✅ Received welcome message from server');
								break;
							case 'registered':
								console.log(
									'[WebSocket] ✅ Successfully registered with server as:',
									discordUserId
								);
								break;
							case 'registration_success':
								console.log('[WebSocket] ✅ Successfully registered with server');
								break;
							case 'auto_initiate_offer':
								if (message.targetUserId && !autoConnectionAttempted) {
									autoConnectionAttempted = true;
								} else if (autoConnectionAttempted) {
								}
								break;
							case 'auto_expect_offer':
								if (message.fromUserId) {
									autoConnectionAttempted = true;
								}
								break;
							case 'friend_request_received':
								if (message.fromUserId && message.fromFriendCode) {
									// Step 5: Immediately acknowledge receipt to server
									ws?.send(
										JSON.stringify({
											type: 'friend_request_received_ack',
											requesterUserId: message.fromUserId,
											responderUserId: playerId,
											responderFriendCode: friendCode,
											responderPlayerName: playerName,
											responderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
										})
									);
									const requestId = `${message.fromUserId}:${message.fromFriendCode}`;
									if (
										pendingFriendRequest?.fromUserId !== message.fromUserId ||
										lastPendingRequestId !== requestId
									) {
										pendingFriendRequest = {
											fromUserId: message.fromUserId,
											fromFriendCode: message.fromFriendCode,
											fromPlayerName: message.fromPlayerName,
											fromTimezone: message.fromTimezone
										};
										lastPendingRequestId = requestId;

										const answer = await ask(
											`Accept friend request from ${pendingFriendRequest?.fromPlayerName || pendingFriendRequest?.fromFriendCode}`,
											{
												title: 'Accept friend request',
												kind: 'info'
											}
										);

										handleFriendRequestResponse(answer);
									}
								}
								break;
							case 'friend_request_accepted_notice':
								if (message.friend) {
									pendingFriendRequests = pendingFriendRequests.filter(
										(req) => req.friendCode !== message.friend.friendCode
									);
									const store = await load('store.json', {
										defaults: {},
										autoSave: false
									});
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
									addFriendToList(message.friend);
									alert(
										`Your friend request to ${message.friend.playerName || message.friend.friendCode} was accepted!`
									);
								}
								break;
							case 'friend_added_notice':
								if (message.friend) {
									addFriendToList(message.friend);
									// Send our logs to the new friend
									if (ws && ws.readyState === WebSocket.OPEN && playerId && message.friend.id) {
										const myLogs = await loadLogsFromDisk();
										ws.send(
											JSON.stringify({
												type: 'sync_logs',
												targetUserId: message.friend.id,
												logs: myLogs
											})
										);
									}
								}
								break;
							case 'friend_request_denied_notice':
								if (message.fromFriendCode) {
									pendingFriendRequests = pendingFriendRequests.map((req) =>
										req.friendCode === message.fromFriendCode ? { ...req, status: 'denied' } : req
									);
									const store = await load('store.json', {
										defaults: {},
										autoSave: false
									});
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
									alert(`Your friend request to ${message.fromFriendCode} was denied.`);
								}
								break;
							case 'friend_request_error':
								alert(`Friend request error: ${message.message}`);
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
										if (ws && ws.readyState === WebSocket.OPEN && playerId && friendId) {
											const myLogs = await loadLogsFromDisk();
											ws.send(
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
												friendCode:
													message.userData.friendCode || friendsList[friendIndex].friendCode
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
								if (
									!pendingFriendRequests.some((req) => req.friendCode === message.targetFriendCode)
								) {
									pendingFriendRequests = [
										...pendingFriendRequests,
										{ friendCode: message.targetFriendCode }
									];
									const store = await load('store.json', {
										defaults: {},
										autoSave: false
									});
									await store.set('pendingFriendRequests', pendingFriendRequests);
									await store.save();
								}
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
					} catch (e) {}
				} else {
				}
			};

			socket.onclose = (event) => {
				console.log('[WebSocket] Connection closed:', event.code, event.reason);
				connectionStatus = 'disconnected';
				ws = null;
				autoConnectionAttempted = false;

				friendsList = friendsList.map((friend) => ({ ...friend, isOnline: false }));
				saveFriendsListToStore();

				// Show error message if not a normal closure
				if (event.code !== 1000) {
					connectionError = 'Connection lost';
				} else {
					connectionError = null;
				}
			};

			socket.onerror = (error) => {
				console.error('[WebSocket] Connection error:', error);
				connectionStatus = 'disconnected';
				connectionError = 'Failed to connect to server. Retrying...';
				ws = null;
				autoConnectionAttempted = false;

				friendsList = friendsList.map((friend) => ({ ...friend, isOnline: false }));
				saveFriendsListToStore();
				reject(new Error('Failed to connect to WebSocket server'));
			};
			} catch (error) {
				console.error('[WebSocket] Failed to connect:', error);
				connectionError = 'Unable to connect to server. Check your internet connection.';
				reject(error instanceof Error ? error : new Error('Failed to connect'));
			}
		});
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
			const savedFriendCode = await store.get<string>('friendCode');
			const savedFriendsList = await store.get<FriendType[]>('friendsList');
			const savedPlayerName = await store.get<string>('playerName');
			const savedPendingFriendRequests =
				await store.get<{ friendCode: string }[]>('pendingFriendRequests');
			const savedEnvironment = await store.get<'LIVE' | 'PTU' | 'HOTFIX'>(
				'selectedEnvironment'
			);

			if (savedEnvironment) {
				selectedEnvironment = savedEnvironment;
			}

			if (savedPlayerName) {
				playerName = savedPlayerName;
			}

			if (savedFriendsList) {
				friendsList = savedFriendsList.map((friend) => ({ ...friend, isOnline: false }));
			}

			if (savedPendingFriendRequests) {
				pendingFriendRequests = savedPendingFriendRequests;
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

			if (!savedFriendCode) {
				friendCode = generateId(6);
				await store.set('friendCode', friendCode);
			} else {
				friendCode = savedFriendCode;
			}

			await store.save();

			// Load the Game.log file if previously selected
			try {
				logLocation = savedFile?.split('/').slice(-2, -1)[0] || null;

				if (savedFile) {
					file = savedFile;
					fileContent = [];
					prevLineCount = 0;
					await handleFile(file);
					handleInitialiseWatch(file);
					// playerId will be extracted from Game.log when parsing
				}
			} catch (error) {}

			// Connect WebSocket only if signed in with Discord
			if (isSignedIn && discordUserId && friendCode && (!ws || ws.readyState !== WebSocket.OPEN)) {
				connectWebSocket();
			}

			// Load logs from disk and display them
			const storedLogs = await loadLogsFromDisk();
			if (storedLogs && Array.isArray(storedLogs)) {
				let groupedLogs = dedupeAndSortLogs(storedLogs);
				groupedLogs = groupKillingSprees(groupedLogs);
				fileContent = groupedLogs;
			}

			check().then((update: any) => {
				if (update?.available) {
					updateInfo = update;
				}
			});

			// Setup deep link listener for OAuth callbacks
			unlisten = await onOpenUrl((urls) => {
				console.log('[Deep Link] Received URLs:', urls);

				for (const url of urls) {
					try {
						const urlObj = new URL(url);

						// Handle picologs://auth?data=...
						if (urlObj.protocol === 'picologs:' && urlObj.hostname === 'auth') {
							const authDataEncoded = urlObj.searchParams.get('data');
							if (authDataEncoded) {
								const authData = JSON.parse(decodeURIComponent(authDataEncoded));
								console.log('[Deep Link] Received auth data');
								handleAuthComplete(authData);
							}
						}
					} catch (error) {
						console.error('[Deep Link] Error parsing URL:', error);
					}
				}
			});
		})();

		// Cleanup on unmount
		return () => {
			if (unlisten) {
				unlisten();
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

			if (currentLineCount < prevLineCount) {
				prevLineCount = 0;
				fileContent = [];
			}

			if (currentLineCount <= prevLineCount) {
				return;
			}

			const newLines = lineBreak.slice(prevLineCount, currentLineCount);
			prevLineCount = currentLineCount;
			lineCount = currentLineCount;

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
							if (ws && ws.readyState === WebSocket.OPEN && discordUserId && friendCode) {
								ws.send(
									JSON.stringify({
										type: 'update_my_details',
										userId: discordUserId, // Use Discord ID for WebSocket
										friendCode: friendCode,
										playerName: playerName,
										playerId: playerId, // Include SC player ID as metadata
										timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
									})
								);
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
								destroyer: destroyer,
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
								open: false
							};
						}
					}
					if (logEntry) {
						if (connectionStatus === 'connected') sendLogViaWebSocket(logEntry);
						appendLogToDisk(logEntry); // Save to disk
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

			if ((!ws || ws.readyState !== WebSocket.OPEN) && playerId) {
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
		await store.delete('friendCode');
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
		friendCode = null;
		friendsList = [];
		pendingFriendRequest = null;
		currentUserDisplayData = null;
		autoConnectionAttempted = false;

		friendCode = generateId(6);
		await store.set('friendCode', friendCode);
		await store.save();

		console.log('[Reset] Data reset complete, Discord auth preserved');

		// Reconnect WebSocket if signed in
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.close();
		}
		connectionStatus = 'disconnected';

		if (isSignedIn && discordUserId) {
			connectWebSocket();
		}
	}

	let fileContentContainer = $state<HTMLDivElement | null>(null);

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
		// send friend request to friend
		ws?.send(
			JSON.stringify({
				type: 'friend_request_by_code',
				targetFriendCode: friendCode,
				requesterId: playerId,
				requesterFriendCode: friendCode,
				requesterPlayerName: playerName,
				requesterTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
			})
		);
	}

	function handleFriendRequestResponse(accepted: boolean) {
		if (!pendingFriendRequest || !ws || !playerId || !friendCode) {
			return;
		}

		const response = {
			type: accepted ? 'friend_request_response_accept' : 'friend_request_response_deny',
			requesterUserId: pendingFriendRequest.fromUserId,
			responderUserId: playerId,
			responderFriendCode: friendCode,
			responderPlayerName: playerName,
			responderTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
		};

		ws.send(JSON.stringify(response));
		pendingFriendRequest = null;
	}

	function handleRemoveFriend(id: string) {
		const friend = friendsList.find((f) => f.id === id);
		if (friend && ws && playerId) {
			ws.send(
				JSON.stringify({
					type: 'remove_friend',
					userId: playerId,
					targetUserId: friend.id,
					friendCode: friend.friendCode
				})
			);
		}
		friendsList = friendsList.filter((f) => f.id !== id);
		saveFriendsListToStore();
	}

	async function handleRemoveFriendRequest(friendCode: string) {
		pendingFriendRequests = pendingFriendRequests.filter(
			(request: { friendCode: string }) => request.friendCode !== friendCode
		);
		const store = await load('store.json', {
			defaults: {},
			autoSave: false
		});
		await store.set('pendingFriendRequests', pendingFriendRequests);
		await store.save();
	}
</script>

<main class="p-0 text-white grid grid-cols-1 grid-rows-[auto_1fr] h-dvh overflow-hidden">
	<Header
		{playerId}
		{friendCode}
		{friendsList}
		{saveFriendsListToStore}
		{connectWebSocket}
		{disconnectWebSocket}
		{connectionStatus}
		{ws}
		{copiedStatusVisible}
		{selectFile}
		bind:logLocation
		{playerName}
		{clearLogs}
		{updateInfo}
		{installUpdate}
		{isSignedIn}
		{discordUser}
		{handleSignIn}
		{handleSignOut}
		{connectionError} />

	<div
		class="grid grid-cols-[290px_1fr] grid-rows-[1fr_auto] h-[calc(100dvh-70px)] overflow-hidden">
		<div
			class="col-start-1 col-end-2 row-start-1 row-end-3 border-r border-white/20 flex flex-col gap-4 overflow-y-auto">
			{#if currentUserDisplayData}
				<User user={currentUserDisplayData} />
			{/if}
			{#if pendingFriendRequests.length > 0}
				<PendingFriendRequests
					{pendingFriendRequests}
					removeFriendRequest={handleRemoveFriendRequest}
					respondToFriendRequest={handleFriendRequestResponse} />
			{/if}
			<Friends {friendsList} removeFriend={handleRemoveFriend} />
			<div class="mt-auto pt-4">
				<AddFriend addFriend={handleAddFriend} />
			</div>
		</div>
		<div
			class="col-start-2 col-end-3 row-start-1 row-end-2 overflow-y-auto flex flex-col bg-black/10 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.3)_rgba(0,0,0,0.2)]"
			bind:this={fileContentContainer}>
			{#if file}
				{#each fileContent as item, index (item.id)}
					{#if index === 0 || fileContent[index - 1]?.line !== item.line || fileContent[index - 1]?.timestamp !== item.timestamp}
						<Item {...item} bind:open={item.open} />
						{#if item.children && item.children.length > 0}
							{#each item.children as child (child.id)}
								<Item {...child} bind:open={child.open} child={true} />
							{/each}
						{/if}
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
			{:else}
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
				class="col-start-2 col-end-3 row-start-2 row-end-3 flex items-center justify-end gap-2 px-4 py-2 bg-[rgb(10,30,42)] border-t border-white/20 text-[0.8rem] text-white/70">
				Log lines processed: {Number(lineCount).toLocaleString()}
			</div>
		{/if}
	</div>
</main>

<style>
	:global(.item:nth-child(2n)) {
		background-color: rgba(255, 255, 255, 0.05);
	}
</style>
