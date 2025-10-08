<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { load } from '@tauri-apps/plugin-store';
	import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
	import { check } from '@tauri-apps/plugin-updater';
	import WebSocket from '@tauri-apps/plugin-websocket';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { listen } from '@tauri-apps/api/event';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import Header from '../components/Header.svelte';
	import NotificationToasts from '../components/NotificationToasts.svelte';
	import { setAppContext } from '$lib/appContext.svelte';
	import {
		connectWebSocket as apiConnectWebSocket,
		fetchFriends,
		fetchFriendRequests,
		fetchUserProfile,
		fetchGroupsWithMembers,
		fetchGroupMembers,
		fetchGroupInvitations,
		subscribe as apiSubscribe,
		acceptFriendRequest as apiAcceptFriendRequest,
		denyFriendRequest as apiDenyFriendRequest,
		acceptGroupInvitation as apiAcceptGroupInvitation,
		denyGroupInvitation as apiDenyGroupInvitation
	} from '$lib/api';
	import { decompressLogs } from '$lib/compression';
	import { loadAuthData, signOut, handleAuthComplete, getJwtToken } from '$lib/oauth';
	import { createWebSocketConnection, sendJsonMessage } from '$lib/websocket-helper';
	import {
		loadCachedFriends,
		loadCachedGroups,
		loadCachedGroupMembers,
		saveFriendsCache,
		saveGroupsCache,
		saveGroupMembersCache
	} from '$lib/cache';
	import {
		mergeFriends,
		mergeGroups,
		mergeGroupMembers,
		friendsHaveChanged,
		groupsHaveChanged
	} from '$lib/merge';
	import { getStorageValue, setStorageValue, deleteStorageValue } from '$lib/storage';
	import {
		validateMessage,
		SingleLogSchema,
		GroupLogSchema,
		SyncLogsSchema,
		BatchLogsSchema,
		BatchGroupLogsSchema,
		UserPresenceSchema,
		RefetchGroupDetailsSchema,
		AuthCompleteSchema
	} from '$lib/validation';
	import type { Update } from '@tauri-apps/plugin-updater';
	import type { ApiGroupMember } from '$lib/api';

	let { children } = $props();

	// Initialize shared app context
	const appCtx = setAppContext();

	// Track if initial data load is complete (used to prevent saving during load)
	let initialLoadComplete = $state(false);

	// Update info state (not in context - layout-specific)
	let updateInfo = $state<Update | null>(null);

	// Sync user profile from API
	async function syncUserProfileFromAPI() {
		if (!appCtx.isSignedIn) {
			return;
		}

		const profile = await fetchUserProfile();
		if (profile) {
			appCtx.apiUserProfile = profile;

			// Cache friend code for instant display on next app launch
			if (profile.friendCode) {
				appCtx.cachedFriendCode = profile.friendCode;
				const store = await load('store.json', { defaults: {}, autoSave: 100 });
				await store.set('friendCode', profile.friendCode);
			}

			// Also set discordUser for UI display
			appCtx.discordUser = {
				id: profile.discordId,
				username: profile.username,
				avatar: profile.avatar
			};
		}
	}

	// Sync friends from API
	async function syncFriendsFromAPI() {
		if (!appCtx.isSignedIn) {
			return;
		}

		appCtx.isSyncingFriends = true;

		try {
			const friends = await fetchFriends();
			appCtx.apiFriends = friends;

			// Convert API friends to local format
			const freshFriends = friends.map((f) => ({
				id: f.friendUserId,
				discordId: f.friendDiscordId,
				friendCode: '',
				name: f.friendDisplayName, // Server already sends the correct display name
				avatar: f.friendAvatar,
				status: 'confirmed' as const,
				timezone: f.friendTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
				isOnline: false,
				isConnected: false
			}));

			// Only update if data has changed to avoid unnecessary re-renders
			if (friendsHaveChanged(appCtx.friendsList, freshFriends)) {
				// Merge with existing to preserve UI state
				appCtx.friendsList = mergeFriends(appCtx.friendsList, freshFriends);

				// Save to cache
				await saveFriendsCache(appCtx.friendsList);
			}
		} finally {
			appCtx.isSyncingFriends = false;
			appCtx.isLoadingFriends = false;
		}
	}

	// Sync friend requests from API
	async function syncFriendRequestsFromAPI() {
		if (!appCtx.isSignedIn) {
			return;
		}

		const requests = await fetchFriendRequests();
		appCtx.apiFriendRequests = requests;
	}

	// Sync groups from API
	async function syncGroupsFromAPI() {
		if (!appCtx.isSignedIn) {
			return;
		}

		appCtx.isSyncingGroups = true;

		try {
			// Fetch groups with members in a single optimized request
			const { groups, members } = await fetchGroupsWithMembers();

			// Only update if data has changed
			if (groupsHaveChanged(appCtx.groups, groups)) {
				appCtx.groups = mergeGroups(appCtx.groups, groups);
				await saveGroupsCache(appCtx.groups);
			}

			// Convert members object to SvelteMap
			const freshGroupMembers = new SvelteMap<string, ApiGroupMember[]>();
			for (const [groupId, membersList] of Object.entries(members)) {
				freshGroupMembers.set(groupId, membersList as ApiGroupMember[]);
			}

			// Merge group members
			appCtx.groupMembers = mergeGroupMembers(appCtx.groupMembers, freshGroupMembers);
			await saveGroupMembersCache(appCtx.groupMembers);

			// Fetch pending invitations
			const invitations = await fetchGroupInvitations();
			appCtx.groupInvitations = invitations;
		} finally {
			appCtx.isSyncingGroups = false;
			appCtx.isLoadingGroups = false;
		}
	}

	// Connect WebSocket
	async function connectWebSocket(): Promise<void> {
		if (!appCtx.discordUserId) {
			appCtx.connectionError = 'Please sign in with Discord to connect';
			return Promise.reject(new Error('No user ID available'));
		}

		// SECURITY: Validate Discord user ID format before connecting
		// Discord IDs are 17-19 digit numeric strings
		if (!/^\d{17,19}$/.test(appCtx.discordUserId)) {
			console.error('[Auth Security] Invalid Discord user ID format:', appCtx.discordUserId);
			appCtx.connectionError = 'Invalid user ID - please sign in again';
			await handleSignOut();
			return Promise.reject(new Error('Invalid user ID format'));
		}

		if (appCtx.ws) {
			return Promise.resolve();
		}

		if (appCtx.reconnectTimer) {
			clearTimeout(appCtx.reconnectTimer);
			appCtx.reconnectTimer = null;
		}

		appCtx.connectionStatus = 'connecting';
		appCtx.connectionError = null;

		try {
			// Set up subscriptions BEFORE connecting
			apiSubscribe('registered', async () => {
				await syncUserProfileFromAPI();
				await syncFriendsFromAPI();
				await syncFriendRequestsFromAPI();
				await syncGroupsFromAPI();
			});

			apiSubscribe('refetch_friends', async () => {
				const previousFriendCount = appCtx.apiFriends.length;
				await syncFriendsFromAPI();
				// Show notification if friends list increased (friend request accepted)
				if (appCtx.apiFriends.length > previousFriendCount) {
					appCtx.addNotification('Friend request accepted', 'success');
				}
			});

			apiSubscribe('refetch_friend_requests', async () => {
				const previousRequestCount = appCtx.apiFriendRequests.length;

				await syncFriendRequestsFromAPI();

				// Show notification for new friend requests (only if count increased)
				if (appCtx.apiFriendRequests.length > previousRequestCount) {
					const latestRequest = appCtx.apiFriendRequests.find((r) => r.direction === 'incoming');
					if (latestRequest) {
						const requesterName = latestRequest.fromUsername || 'Someone';
						appCtx.addNotification(`New friend request from ${requesterName}`, 'info');
					}
				}
			});

			apiSubscribe('refetch_groups', async () => {
				await syncGroupsFromAPI();
			});

			apiSubscribe('refetch_group_invitations', async () => {
				const previousInvitationCount = appCtx.groupInvitations.length;
				await syncGroupsFromAPI(); // This also fetches invitations
				// Show notification for new group invitations
				if (appCtx.groupInvitations.length > previousInvitationCount) {
					const latestInvitation = appCtx.groupInvitations[0];
					const groupName = latestInvitation?.group?.name || 'a group';
					const inviterName = latestInvitation?.inviter?.username || 'Someone';
					appCtx.addNotification(`${inviterName} invited you to ${groupName}`, 'info');
				}
			});

			apiSubscribe('refetch_group_details', async (message: unknown) => {
				// SECURITY: Validate incoming refetch group details message
				const validated = validateMessage(RefetchGroupDetailsSchema, message);
				if (validated && validated.groupId) {
					const members = await fetchGroupMembers(validated.groupId);
					appCtx.groupMembers.set(validated.groupId, members);
				} else {
					console.warn('[Security] Invalid refetch_group_details message received:', message);
				}
			});

			apiSubscribe('user_online', async (message: unknown) => {
				// SECURITY: Validate incoming user online message
				const validated = validateMessage(UserPresenceSchema, message);
				if (validated && validated.userId) {
					// Update friend status
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === validated.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: true },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}

					// Update group members online status
					appCtx.groupMembers.forEach((members, groupId) => {
						const member = members.find((m) => m.discordId === validated.userId);
						if (member) {
							member.isOnline = true;
							member.isConnected = true;
							// Trigger reactivity
							appCtx.groupMembers.set(groupId, [...members]);
						}
					});

					// Trigger sync event for delta sync
					window.dispatchEvent(
						new CustomEvent('friend-came-online', {
							detail: { friendId: validated.userId }
						})
					);
				} else {
					console.warn('[Security] Invalid user_online message received:', message);
				}
			});

			apiSubscribe('user_offline', (message: unknown) => {
				// SECURITY: Validate incoming user offline message
				const validated = validateMessage(UserPresenceSchema, message);
				if (validated && validated.userId) {
					// Update friend status
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === validated.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: false },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}

					// Update group members offline status
					appCtx.groupMembers.forEach((members, groupId) => {
						const member = members.find((m) => m.discordId === validated.userId);
						if (member) {
							member.isOnline = false;
							member.isConnected = false;
							// Trigger reactivity
							appCtx.groupMembers.set(groupId, [...members]);
						}
					});
				} else {
					console.warn('[Security] Invalid user_offline message received:', message);
				}
			});

			apiSubscribe('group_log', (message: unknown) => {
				// SECURITY: Validate incoming group log message
				const validated = validateMessage(GroupLogSchema, message);
				if (validated) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(
						new CustomEvent('group-log-received', {
							detail: {
								log: validated.log,
								groupId: validated.groupId,
								senderId: validated.senderId,
								senderDisplayName: validated.senderDisplayName
							}
						})
					);
				} else {
					console.warn('[Security] Invalid group_log message received:', message);
				}
			});

			apiSubscribe('log', (message: unknown) => {
				// SECURITY: Validate incoming log message
				const validated = validateMessage(SingleLogSchema, message);
				if (validated) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(
						new CustomEvent('friend-log-received', {
							detail: {
								log: validated.log
							}
						})
					);
				} else {
					console.warn('[Security] Invalid log message received:', message);
				}
			});

			apiSubscribe('sync_logs', (message: unknown) => {
				// SECURITY: Validate incoming sync logs message
				const validated = validateMessage(SyncLogsSchema, message);
				if (validated) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(
						new CustomEvent('sync-logs-received', {
							detail: {
								logs: validated.logs,
								senderId: validated.senderId,
								hasMore: validated.hasMore,
								total: validated.total,
								offset: validated.offset,
								limit: validated.limit
							}
						})
					);
				} else {
					console.warn('[Security] Invalid sync_logs message received:', message);
				}
			});

			// Handle batched friend logs (with optional compression)
			apiSubscribe('batch_logs', async (message: unknown) => {
				try {
					// SECURITY: Validate incoming batch logs message
					const validated = validateMessage(BatchLogsSchema, message);
					if (!validated) {
						console.warn('[Security] Invalid batch_logs message received:', message);
						return;
					}

					let logs: unknown[];

					// Check if message is compressed
					if (validated.compressed && validated.compressedData) {
						logs = await decompressLogs(validated.compressedData);
					} else {
						logs = validated.logs || [];
					}

					if (logs && Array.isArray(logs)) {
						// Dispatch individual events for each log in the batch
						logs.forEach((log: unknown) => {
							window.dispatchEvent(
								new CustomEvent('friend-log-received', {
									detail: { log }
								})
							);
						});
					}
				} catch (error) {
					console.error('[Batch Decompression] Failed to decompress friend logs:', error);
				}
			});

			// Handle batched group logs (with optional compression)
			apiSubscribe('batch_group_logs', async (message: unknown) => {
				try {
					// SECURITY: Validate incoming batch group logs message
					const validated = validateMessage(BatchGroupLogsSchema, message);
					if (!validated) {
						console.warn('[Security] Invalid batch_group_logs message received:', message);
						return;
					}

					let logs: unknown[];

					// Check if message is compressed
					if (validated.compressed && validated.compressedData) {
						logs = await decompressLogs(validated.compressedData);
					} else {
						logs = validated.logs || [];
					}

					if (logs && Array.isArray(logs)) {
						// Dispatch individual events for each log in the batch
						logs.forEach((log: unknown) => {
							window.dispatchEvent(
								new CustomEvent('group-log-received', {
									detail: {
										log,
										groupId: validated.groupId,
										senderId: validated.senderId,
										senderDisplayName: validated.senderDisplayName
									}
								})
							);
						});
					}
				} catch (error) {
					console.error('[Batch Group Decompression] Failed to decompress group logs:', error);
				}
			});

			const socket = await apiConnectWebSocket(appCtx.discordUserId);
			appCtx.ws = socket;

			appCtx.connectionStatus = 'connected';
			appCtx.connectionError = null;
			appCtx.reconnectAttempts = 0;
			if (appCtx.reconnectTimer) {
				clearTimeout(appCtx.reconnectTimer);
				appCtx.reconnectTimer = null;
			}

			return Promise.resolve();
		} catch (error) {
			console.error('[WebSocket] Failed to connect:', error);

			// Show user-friendly error toast
			const errorMessage =
				error instanceof Error && error.message.includes('timeout')
					? "Can't connect to server - connection timed out"
					: 'Failed to connect to server';

			appCtx.addNotification(errorMessage, 'error');

			appCtx.connectionStatus = 'disconnected';
			appCtx.connectionError = errorMessage;
			appCtx.ws = null;
			// Don't reset autoConnectionAttempted here - let the retry timer control it

			appCtx.friendsList = appCtx.friendsList.map((friend) => ({ ...friend, isOnline: false }));
			return Promise.reject(error instanceof Error ? error : new Error('Failed to connect'));
		}
	}

	// Extract message string from Tauri WebSocket format
	function extractMessageString(msg: unknown): string | null {
		if (typeof msg === 'string') {
			return msg;
		} else if (
			typeof msg === 'object' &&
			msg !== null &&
			'type' in msg &&
			msg.type === 'Text' &&
			'data' in msg &&
			typeof msg.data === 'string'
		) {
			return msg.data;
		}
		return null; // Skip non-text messages (ping/pong/etc)
	}

	// Handle WebSocket message during authentication
	async function handleAuthWebSocketMessage(msg: unknown, socket: WebSocket): Promise<void> {
		try {
			const messageStr = extractMessageString(msg);
			if (!messageStr) return;

			const message = JSON.parse(messageStr) as { type?: string; message?: string };

			// Handle auth_complete message with JWT
			if (message.type === 'auth_complete' || message.type === 'desktop_auth_complete') {
				await processAuthComplete(message, socket);
			}

			// Handle error message
			if (message.type === 'error') {
				console.error('[Auth] ❌ Auth error:', message.message);
				appCtx.authError = message.message || 'Authentication failed';
				appCtx.connectionStatus = 'disconnected';

				// Dismiss auth notification on error
				if (appCtx.authNotificationId) {
					appCtx.removeNotification(appCtx.authNotificationId);
					appCtx.authNotificationId = null;
				}
			}
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				console.error('[Auth] Error handling message:', error);
			}
		}
	}

	// Process authentication completion
	async function processAuthComplete(message: unknown, socket: WebSocket): Promise<void> {
		// SECURITY: Validate auth_complete message
		const validated = validateMessage(AuthCompleteSchema, message);
		if (!validated) {
			console.error('[Auth Security] Invalid auth_complete message received:', message);
			appCtx.authError = 'Authentication failed - invalid server response';
			appCtx.connectionStatus = 'disconnected';

			// Dismiss auth notification on error
			if (appCtx.authNotificationId) {
				appCtx.removeNotification(appCtx.authNotificationId);
				appCtx.authNotificationId = null;
			}
			return;
		}

		await handleAuthComplete({
			jwt: validated.data.jwt,
			user: validated.data.user
		});

		// Extract user ID from JWT
		const [, payloadB64] = validated.data.jwt.split('.');
		const payload = JSON.parse(atob(payloadB64));

		appCtx.discordUserId = payload.userId;
		const userData = {
			id: validated.data.user.discordId,
			username: validated.data.user.username,
			avatar: validated.data.user.avatar
		};
		appCtx.discordUser = userData;
		appCtx.isSignedIn = true;

		// Store user ID and user data - Use autoSave with 100ms debounce for single write operation
		const store = await load('store.json', { defaults: {}, autoSave: 100 });
		await store.set('discordUserId', appCtx.discordUserId);
		await store.set('discordUser', userData);
		// No explicit save needed - autoSave will persist the change

		// Dismiss auth notification
		if (appCtx.authNotificationId) {
			appCtx.removeNotification(appCtx.authNotificationId);
			appCtx.authNotificationId = null;
		}

		// Close temp auth socket and connect to main WebSocket
		try {
			await socket.disconnect();
		} catch (e) {
			console.error('[Auth] Error disconnecting temp socket:', e);
		}
		appCtx.ws = null;

		await connectWebSocket();
	}

	// Handle sign in
	async function handleSignIn() {
		appCtx.authError = null;

		try {
			// Connect WebSocket first to receive auth completion
			appCtx.connectionStatus = 'connecting';
			// Use production WebSocket URL in production builds, dev URL in dev mode
			const wsUrl = import.meta.env.PROD
				? import.meta.env.VITE_WS_URL_PROD
				: import.meta.env.VITE_WS_URL_DEV || import.meta.env.VITE_WS_URL_PROD;

			console.log('[Auth] WebSocket URL:', wsUrl);
			console.log('[Auth] Environment variables:', {
				PROD: import.meta.env.PROD,
				VITE_WS_URL_PROD: import.meta.env.VITE_WS_URL_PROD,
				VITE_WS_URL_DEV: import.meta.env.VITE_WS_URL_DEV,
				VITE_WEBSITE_URL_PROD: import.meta.env.VITE_WEBSITE_URL_PROD,
				VITE_DISCORD_CLIENT_ID: import.meta.env.VITE_DISCORD_CLIENT_ID
			});

			if (!wsUrl) {
				throw new Error('WebSocket URL is not configured. Please check environment variables.');
			}

			// Create WebSocket connection using unified helper
			const connection = await createWebSocketConnection({
				url: wsUrl,
				timeout: 10000,
				onMessage: async (msg: unknown) => {
					await handleAuthWebSocketMessage(msg, connection.socket);
				}
			});

			// SECURITY: Generate session ID with timestamp for single-use validation
			// Format: {uuid}:{timestamp}
			const sessionId = `${crypto.randomUUID()}:${Date.now()}`;
			appCtx.authSessionId = sessionId;

			const initPayload = {
				type: 'init_desktop_auth',
				sessionId: sessionId,
				requestId: 'init_auth'
			};

			// Send init message using unified send helper
			await connection.send(JSON.stringify(initPayload));

			appCtx.ws = connection.socket;
			appCtx.connectionStatus = 'connected';

			// Open Discord app directly to OAuth authorization
			// Discord only accepts https:// redirect URIs, so we use website as intermediary
			const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
			const websiteUrl = import.meta.env.PROD
				? import.meta.env.VITE_WEBSITE_URL_PROD
				: import.meta.env.VITE_WEBSITE_URL_DEV || import.meta.env.VITE_WEBSITE_URL_PROD;
			const redirectUri = `${websiteUrl}/auth/desktop/callback`;
			const scope = 'identify';

			// Discord protocol format: discord://-/oauth2/authorize?client_id=...
			// State includes session ID so website can redirect back to desktop app
			const discordAuthUrl = `discord://-/oauth2/authorize?client_id=${discordClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${sessionId}`;

			await openUrl(discordAuthUrl);

			// Show notification to check Discord app (no auto-dismiss)
			const discordLogo =
				'<svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor"><path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/></svg>';
			const notificationId = appCtx.addNotification(
				'Check your Discord app to authorize Picologs',
				'info',
				discordLogo,
				false
			);
			appCtx.authNotificationId = notificationId;
		} catch (error) {
			console.error('[Auth] ❌ Failed to initiate auth:', error);

			// Show user-friendly error toast
			const errorMessage =
				error instanceof Error && error.message.includes('timeout')
					? "Can't connect to server - connection timed out"
					: 'Failed to connect to server. Please try again.';

			appCtx.addNotification(errorMessage, 'error');

			appCtx.connectionStatus = 'disconnected';
			appCtx.authError = errorMessage;
		}
	}

	// Handle sign out
	async function handleSignOut() {
		try {
			await signOut();
			appCtx.isSignedIn = false;
			appCtx.discordUser = null;
			appCtx.discordUserId = null;

			// Store strategy: Use autoSave with 100ms debounce for single delete operation
			const store = await load('store.json', {
				defaults: {},
				autoSave: 100
			});
			await store.delete('discordUserId');
			await store.delete('discordUser');
			// No explicit save needed - autoSave will persist the deletion

			if (appCtx.ws) {
				try {
					await appCtx.ws.disconnect();
				} catch (error) {
					console.error('[WebSocket] Error disconnecting:', error);
				}
			}
			appCtx.connectionStatus = 'disconnected';
		} catch (error) {
			console.error('Sign out failed:', error);
		}
	}

	// Install update
	async function installUpdate() {
		if (updateInfo) {
			await updateInfo.downloadAndInstall();
		}
	}

	// Handle accepting friend request
	async function handleAcceptFriend(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new SvelteSet(appCtx.processingFriendRequests);

			const success = await apiAcceptFriendRequest(friendshipId);
			if (success) {
				appCtx.addNotification('Friend request accepted', 'success');
			} else {
				appCtx.addNotification('Failed to accept friend request', 'error');
			}
		} catch (error) {
			console.error('Failed to accept friend request:', error);
			appCtx.addNotification('Failed to accept friend request', 'error');
		} finally {
			appCtx.processingFriendRequests.delete(friendshipId);
			appCtx.processingFriendRequests = new SvelteSet(appCtx.processingFriendRequests);
		}
	}

	// Handle denying friend request
	async function handleDenyFriend(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new SvelteSet(appCtx.processingFriendRequests);

			const success = await apiDenyFriendRequest(friendshipId);
			if (success) {
				appCtx.addNotification('Friend request denied', 'info');
			} else {
				appCtx.addNotification('Failed to deny friend request', 'error');
			}
		} catch (error) {
			console.error('Failed to deny friend request:', error);
			appCtx.addNotification('Failed to deny friend request', 'error');
		} finally {
			appCtx.processingFriendRequests.delete(friendshipId);
			appCtx.processingFriendRequests = new SvelteSet(appCtx.processingFriendRequests);
		}
	}

	// Handle accepting group invitation
	async function handleAcceptInvitation(invitationId: string) {
		try {
			appCtx.processingGroupInvitations.add(invitationId);
			appCtx.processingGroupInvitations = new SvelteSet(appCtx.processingGroupInvitations);

			const result = await apiAcceptGroupInvitation(invitationId);
			if (result) {
				appCtx.addNotification('Group invitation accepted', 'success');
			} else {
				appCtx.addNotification('Failed to accept invitation', 'error');
			}
		} catch (error) {
			console.error('Failed to accept group invitation:', error);
			appCtx.addNotification('Failed to accept invitation', 'error');
		} finally {
			appCtx.processingGroupInvitations.delete(invitationId);
			appCtx.processingGroupInvitations = new SvelteSet(appCtx.processingGroupInvitations);
		}
	}

	// Handle denying group invitation
	async function handleDenyInvitation(invitationId: string) {
		try {
			appCtx.processingGroupInvitations.add(invitationId);
			appCtx.processingGroupInvitations = new SvelteSet(appCtx.processingGroupInvitations);

			const success = await apiDenyGroupInvitation(invitationId);
			if (success) {
				appCtx.addNotification('Group invitation denied', 'info');
			} else {
				appCtx.addNotification('Failed to deny invitation', 'error');
			}
		} catch (error) {
			console.error('Failed to deny group invitation:', error);
			appCtx.addNotification('Failed to deny invitation', 'error');
		} finally {
			appCtx.processingGroupInvitations.delete(invitationId);
			appCtx.processingGroupInvitations = new SvelteSet(appCtx.processingGroupInvitations);
		}
	}

	// On mount - initialize authentication state
	onMount(() => {
		let unlisten: (() => void) | null = null;
		let singleInstanceUnlisten: (() => void) | null = null;

		(async () => {
			// Listen for WebSocket auth failure events
			const handleAuthFailed = async () => {
				await handleSignOut();
			};
			window.addEventListener('websocket-auth-failed', handleAuthFailed);

			// Store strategy: Use autoSave with 300ms debounce for initialization read
			const store = await load('store.json', {
				defaults: {},
				autoSave: 300
			});

			// Clean up corrupted store data (fix for event object being stored)
			const selectedEnv = await store.get<unknown>('selectedEnvironment');
			if (
				selectedEnv &&
				typeof selectedEnv === 'object' &&
				'isTrusted' in selectedEnv &&
				selectedEnv.isTrusted !== undefined
			) {
				// This is an event object, not a valid environment - delete it
				await store.delete('selectedEnvironment');
			}

			// Reset authentication state to prevent stuck button
			appCtx.isAuthenticating = false;

			// Load persisted auth state FIRST to prevent layout shift
			const storedDiscordUserId = await store.get<string>('discordUserId');
			const cachedFriendCode = await store.get<string>('friendCode');
			const cachedDiscordUser = await store.get<{
				id: string;
				username: string;
				avatar: string | null;
			}>('discordUser');
			const savedFile = await store.get<string>('lastFile');

			// SECURITY: Validate Discord user ID format (17-19 digit numeric string)
			// This prevents corrupted store data (e.g., "LIVE", environment names) from being used
			const isValidDiscordId = storedDiscordUserId && /^\d{17,19}$/.test(storedDiscordUserId);

			if (isValidDiscordId) {
				// Set auth state from cache
				appCtx.discordUserId = storedDiscordUserId;
				appCtx.isSignedIn = true;

				if (cachedFriendCode) {
					appCtx.cachedFriendCode = cachedFriendCode;
				}

				if (cachedDiscordUser) {
					appCtx.discordUser = cachedDiscordUser;
				}
			} else {
				// Invalid or missing Discord ID - clear corrupted auth data
				if (storedDiscordUserId && !isValidDiscordId) {
					console.warn(
						'[Auth Security] Invalid Discord ID detected in store, clearing:',
						storedDiscordUserId
					);
					await store.delete('discordUserId');
					await store.delete('discordUser');
				}
				// No stored auth - user is not signed in
				appCtx.isSignedIn = false;
				appCtx.discordUser = null;
				// Don't show loading state if user is not signed in
				appCtx.isLoadingFriends = false;
				appCtx.isLoadingGroups = false;
			}

			// Load cached log location for immediate header rendering
			if (savedFile) {
				appCtx.cachedLogLocation = savedFile.split('/').slice(-2, -1)[0] || null;
			}

			// Load cached data immediately (stale-while-revalidate pattern)
			// Load cache regardless of sign-in status so data persists across sign-in/out
			const cachedFriends = await loadCachedFriends();
			if (cachedFriends.length > 0) {
				appCtx.friendsList = cachedFriends;
			}
			// Set loading to false after cache attempt (will show cached data or empty state)
			// WebSocket sync will refresh the data when signed in
			appCtx.isLoadingFriends = false;

			// Load groups cache
			const cachedGroups = await loadCachedGroups();
			if (cachedGroups.length > 0) {
				appCtx.groups = cachedGroups;
			}
			// Set loading to false after cache attempt
			appCtx.isLoadingGroups = false;

			// Load group members cache
			const cachedGroupMembers = await loadCachedGroupMembers();
			if (cachedGroupMembers.size > 0) {
				appCtx.groupMembers = cachedGroupMembers;
			}

			// Load selected group ID (do this AFTER groups are loaded)
			const savedSelectedGroupId = await getStorageValue<string>('store.json', 'selectedGroupId');
			if (savedSelectedGroupId) {
				appCtx.selectedGroupId = savedSelectedGroupId;
			}

			// Mark initial load as complete - now safe to save changes
			initialLoadComplete = true;

			// No explicit save needed - autoSave handles any initialization changes

			// Lazy validate auth and load user data in background
			if (appCtx.isSignedIn && appCtx.discordUserId) {
				// Validate JWT token (if expired, sign out)
				const jwtToken = await getJwtToken();

				if (jwtToken) {
					// Load fresh auth data from disk
					const authData = await loadAuthData();
					if (authData) {
						const userData = {
							id: authData.user.id,
							username: authData.user.global_name || authData.user.username,
							avatar: authData.user.avatar
						};
						appCtx.discordUser = userData;

						// Cache discord user for next app launch
						await store.set('discordUser', userData);
					}

					// Connect WebSocket if not already connected
					if (!appCtx.ws && !appCtx.autoConnectionAttempted) {
						appCtx.autoConnectionAttempted = true;
						connectWebSocket().catch(() => {
							// Connection failed - user can manually retry from the UI
						});
					}
				} else {
					// Auth expired - sign out
					appCtx.connectionError = 'Authentication expired - please sign in again';
					await handleSignOut();
				}
			}

			check().then((update: Update | null) => {
				if (update?.available) {
					updateInfo = update;
				}
			});

			/**
			 * Normalizes deep link pathname to handle URL variations.
			 *
			 * Deep link URLs can arrive in different formats:
			 * - picologs://auth/callback       → normalized to "auth/callback"
			 * - picologs:///auth/callback      → normalized to "auth/callback"
			 * - picologs://auth/callback/      → normalized to "auth/callback"
			 * - picologs://auth (hostname)     → normalized to "auth"
			 *
			 * @param urlObj - Parsed URL object
			 * @returns Normalized path string without leading/trailing slashes
			 */
			const normalizeDeepLinkPath = (urlObj: URL): string => {
				// If hostname is present, use it (e.g., picologs://auth)
				if (urlObj.hostname && urlObj.hostname !== '') {
					const hostnamePath = urlObj.hostname;
					const pathnamePath = urlObj.pathname.replace(/^\/+|\/+$/g, '');
					return pathnamePath ? `${hostnamePath}/${pathnamePath}` : hostnamePath;
				}

				// Otherwise, normalize pathname by removing leading/trailing slashes
				// pathname can be "//auth/callback", "/callback", or "//auth"
				return urlObj.pathname.replace(/^\/+|\/+$/g, '');
			};

			// Helper function to process deep link URLs
			const processDeepLink = async (url: string) => {
				try {
					const urlObj = new URL(url);

					// Only process picologs:// protocol URLs
					if (urlObj.protocol !== 'picologs:') {
						return;
					}

					const normalizedPath = normalizeDeepLinkPath(urlObj);

					// Handle Discord OAuth callback
					// Expected formats: picologs://auth/callback, picologs:///auth/callback, etc.
					if (normalizedPath === 'auth/callback') {
						const code = urlObj.searchParams.get('code');
						const state = urlObj.searchParams.get('state');

						// SECURITY: Validate state parameter matches expected session ID
						if (!state) {
							console.error('[Deep Link] ⚠️ SECURITY: Missing state parameter in OAuth callback');
							appCtx.authError = 'Authentication failed - invalid callback (missing state)';
							appCtx.isAuthenticating = false;
							return;
						}

						if (state !== appCtx.authSessionId) {
							console.error(
								'[Deep Link] ⚠️ SECURITY: State parameter mismatch - possible CSRF attack'
							);
							console.error('[Deep Link] Expected:', appCtx.authSessionId, 'Received:', state);
							appCtx.authError = 'Authentication failed - session mismatch. Please try again.';
							appCtx.isAuthenticating = false;
							return;
						}

						// SECURITY: Validate timestamp in state to prevent replay attacks
						// State format: {uuid}:{timestamp}
						const stateParts = state.split(':');
						if (stateParts.length === 2) {
							const timestamp = parseInt(stateParts[1], 10);
							const age = Date.now() - timestamp;
							const MAX_STATE_AGE = 5 * 60 * 1000; // 5 minutes

							if (age > MAX_STATE_AGE) {
								console.error('[Deep Link] ⚠️ SECURITY: OAuth state expired (age: ${age}ms)');
								appCtx.authError = 'Authentication timed out - please try again';
								appCtx.isAuthenticating = false;
								return;
							}
						}

						// SECURITY: Clear session ID to enforce single-use
						const usedSessionId = appCtx.authSessionId;
						appCtx.authSessionId = null;

						if (!code) {
							console.error('[Deep Link] ❌ Missing authorization code in OAuth callback');
							appCtx.authError = 'OAuth callback failed - missing authorization code';
							appCtx.isAuthenticating = false;
							return;
						}

						if (!appCtx.ws) {
							console.error('[Deep Link] ❌ WebSocket not connected');
							appCtx.authError = 'Authentication failed - server connection lost';
							appCtx.isAuthenticating = false;
							appCtx.addNotification('Authentication failed - server connection lost', 'error');
							return;
						}

						try {
							// Send OAuth code to server via WebSocket (use the validated session ID)
							const payload = {
								type: 'discord_oauth_callback',
								requestId: 'oauth_callback',
								data: {
									code,
									sessionId: usedSessionId
								}
							};

							// Send using unified helper
							await sendJsonMessage(appCtx.ws, payload);
						} catch (sendError) {
							console.error('[Deep Link] ❌ Failed to send OAuth callback:', sendError);
							appCtx.authError = 'Authentication failed - server not responding';
							appCtx.isAuthenticating = false;
							appCtx.addNotification('Authentication failed - server not responding', 'error');
							return;
						}
					}
					// Legacy deep link handler (for backward compatibility)
					// Expected format: picologs://auth?data=...
					else if (normalizedPath === 'auth') {
						const authDataEncoded = urlObj.searchParams.get('data');
						if (authDataEncoded) {
							const authData = JSON.parse(decodeURIComponent(authDataEncoded));
							await handleAuthComplete(authData);
						}
					}
				} catch (error) {
					console.error('[Deep Link] Error parsing URL:', error);
				}
			};

			// Listen for deep links from single-instance plugin
			singleInstanceUnlisten = await listen<string>('deep-link-received', async (event) => {
				await processDeepLink(event.payload);
			});

			unlisten = await onOpenUrl(async (urls) => {
				for (const url of urls) {
					await processDeepLink(url);
				}
			});
		})();

		return () => {
			if (unlisten) {
				unlisten();
			}
			if (singleInstanceUnlisten) {
				singleInstanceUnlisten();
			}
		};
	});

	// Persist selectedGroupId to store when it changes
	// Only runs AFTER initialLoadComplete is true (set after onMount loads initial value)
	$effect(() => {
		const groupId = appCtx.selectedGroupId;

		// Skip saving until initial load completes
		if (!initialLoadComplete) {
			return;
		}

		(async () => {
			try {
				if (groupId !== null) {
					await setStorageValue('store.json', 'selectedGroupId', groupId);
				} else {
					await deleteStorageValue('store.json', 'selectedGroupId');
				}
			} catch (error) {
				console.error('[Layout Debug] Error saving selectedGroupId:', error);
			}
		})();
	});
</script>

<div class="h-dvh overflow-hidden grid grid-rows-[auto_1fr]">
	<Header
		friendCode={appCtx.apiUserProfile?.friendCode || appCtx.cachedFriendCode}
		{connectWebSocket}
		connectionStatus={appCtx.connectionStatus}
		bind:copiedStatusVisible={appCtx.copiedStatusVisible}
		selectFile={appCtx.pageActions.selectFile || (() => {})}
		logLocation={appCtx.pageActions.logLocation}
		clearLogs={appCtx.pageActions.clearLogs || (() => {})}
		{updateInfo}
		{installUpdate}
		isSignedIn={appCtx.isSignedIn}
		discordUser={appCtx.discordUser}
		{handleSignIn}
		{handleSignOut}
		connectionError={appCtx.connectionError}
		authError={appCtx.authError}
		isAuthenticating={appCtx.isAuthenticating}
		friendRequests={appCtx.apiFriendRequests}
		groupInvitations={appCtx.groupInvitations}
		onAcceptFriend={handleAcceptFriend}
		onDenyFriend={handleDenyFriend}
		onAcceptInvitation={handleAcceptInvitation}
		onDenyInvitation={handleDenyInvitation}
		processingFriendRequests={appCtx.processingFriendRequests}
		processingGroupInvitations={appCtx.processingGroupInvitations}
	/>

	<div class="overflow-hidden flex flex-col">
		{@render children()}
	</div>
</div>

<!-- Notification toasts -->
<NotificationToasts />
