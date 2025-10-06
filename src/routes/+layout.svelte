<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { load } from '@tauri-apps/plugin-store';
	import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
	import { check } from '@tauri-apps/plugin-updater';
	import WebSocket from '@tauri-apps/plugin-websocket';
	import { openUrl } from '@tauri-apps/plugin-opener';
	import { listen } from '@tauri-apps/api/event';
	import Header from '../components/Header.svelte';
	import Iframe from '../components/Iframe.svelte';
	import NotificationToasts from '../components/NotificationToasts.svelte';
	import { setAppContext } from '$lib/appContext.svelte';
	import { page } from '$app/stores';
	import {
		connectWebSocket as apiConnectWebSocket,
		disconnectWebSocket as apiDisconnectWebSocket,
		fetchFriends,
		fetchFriendRequests,
		fetchUserProfile,
		fetchGroups,
		fetchGroupMembers,
		fetchGroupInvitations,
		subscribe as apiSubscribe,
		getWebSocket,
		acceptFriendRequest as apiAcceptFriendRequest,
		denyFriendRequest as apiDenyFriendRequest,
		acceptGroupInvitation as apiAcceptGroupInvitation,
		denyGroupInvitation as apiDenyGroupInvitation
	} from '$lib/api';
	import { decompressLogs } from '$lib/compression';
	import { loadAuthData, signOut, handleAuthComplete, getJwtToken } from '$lib/oauth';
	import type { Friend as FriendType } from '../types';
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

	let { children } = $props();

	// Initialize shared app context
	const appCtx = setAppContext();

	// Track if iframe has been mounted
	let iframeMounted = $state(false);
	let currentIframePage = $state<'profile' | 'friends' | 'groups' | null>(null);

	// Track if initial data load is complete (used to prevent saving during load)
	let initialLoadComplete = $state(false);

	// Watch for route changes and mount/update iframe
	$effect(() => {
		const path = $page.url.pathname;
		if (path === '/profile' || path === '/friends' || path === '/groups') {
			const pageName = path.substring(1) as 'profile' | 'friends' | 'groups';
			iframeMounted = true;
			currentIframePage = pageName;
		} else if (path === '/' && iframeMounted) {
			// Reset iframe when navigating back to main page
			iframeMounted = false;
			currentIframePage = null;
		}
	});

	// Update info state (not in context - layout-specific)
	let updateInfo = $state<any>(null);

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
			console.log('[Sync] Not signed in, skipping friend sync');
			return;
		}

		console.log('[Sync] Starting friend sync...');
		appCtx.isSyncingFriends = true;

		try {
			const friends = await fetchFriends();
			console.log('[Sync] Fetched friends:', friends.length);
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
			console.log('[Sync] 🚫 Cannot sync friend requests - not signed in');
			return;
		}

		console.log('[Sync] 📥 Starting friend request sync...');
		const requests = await fetchFriendRequests();
		console.log('[Sync] ✅ Fetched friend requests:', requests.length, 'total');
		console.log('[Sync] 📊 Friend request breakdown:', {
			incoming: requests.filter(r => r.direction === 'incoming').length,
			outgoing: requests.filter(r => r.direction === 'outgoing').length
		});
		appCtx.apiFriendRequests = requests;
	}

	// Sync groups from API
	async function syncGroupsFromAPI() {
		if (!appCtx.isSignedIn) {
			console.log('[Sync] Not signed in, skipping group sync');
			return;
		}

		console.log('[Sync] Starting group sync...');
		appCtx.isSyncingGroups = true;

		try {
			const groups = await fetchGroups();
			console.log('[Sync] Fetched groups:', groups.length);

			// Only update if data has changed
			if (groupsHaveChanged(appCtx.groups, groups)) {
				appCtx.groups = mergeGroups(appCtx.groups, groups);
				await saveGroupsCache(appCtx.groups);
			}

			// Fetch members for each group
			const freshGroupMembers = new Map<string, any[]>();
			for (const group of groups) {
				const members = await fetchGroupMembers(group.id);
				freshGroupMembers.set(group.id, members);
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
			apiSubscribe('registered', async (message: any) => {
				console.log('[WebSocket] Received registered event, starting data sync...');
				await syncUserProfileFromAPI();
				await syncFriendsFromAPI();
				await syncFriendRequestsFromAPI();
				await syncGroupsFromAPI();
				console.log('[WebSocket] Data sync complete');
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
				console.log('[Layout] 🔔 refetch_friend_requests message received!');
				const previousRequestCount = appCtx.apiFriendRequests.length;
				console.log('[Layout] 📊 Previous friend request count:', previousRequestCount);

				await syncFriendRequestsFromAPI();

				console.log('[Layout] 📊 New friend request count:', appCtx.apiFriendRequests.length);
				console.log('[Layout] 🔍 Count increased?', appCtx.apiFriendRequests.length > previousRequestCount);

				// Show notification for new friend requests (only if count increased)
				if (appCtx.apiFriendRequests.length > previousRequestCount) {
					console.log('[Layout] ✅ Showing notification - count increased!');
					const latestRequest = appCtx.apiFriendRequests.find(r => r.direction === 'incoming');
					console.log('[Layout] 📬 Latest incoming request:', latestRequest);
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

			apiSubscribe('refetch_group_details', async (message: any) => {
				if (message.groupId) {
					const members = await fetchGroupMembers(message.groupId);
					appCtx.groupMembers.set(message.groupId, members);
				}
			});

			apiSubscribe('user_online', async (message: any) => {
				if (message.userId) {
					// Update friend status
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: true },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}

					// Update group members online status
					appCtx.groupMembers.forEach((members, groupId) => {
						const member = members.find(m => m.discordId === message.userId);
						if (member) {
							member.isOnline = true;
							member.isConnected = true;
							// Trigger reactivity
							appCtx.groupMembers.set(groupId, [...members]);
						}
					});

					// Trigger sync event for delta sync
					window.dispatchEvent(new CustomEvent('friend-came-online', {
						detail: { friendId: message.userId }
					}));
				}
			});

			apiSubscribe('user_offline', (message: any) => {
				if (message.userId) {
					// Update friend status
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: false },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}

					// Update group members offline status
					appCtx.groupMembers.forEach((members, groupId) => {
						const member = members.find(m => m.discordId === message.userId);
						if (member) {
							member.isOnline = false;
							member.isConnected = false;
							// Trigger reactivity
							appCtx.groupMembers.set(groupId, [...members]);
						}
					});
				}
			});

			apiSubscribe('group_log', (message: any) => {
				if (message.log && message.groupId) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(new CustomEvent('group-log-received', {
						detail: {
							log: message.log,
							groupId: message.groupId,
							senderId: message.senderId,
							senderUsername: message.senderUsername
						}
					}));
				}
			});

			apiSubscribe('log', (message: any) => {
				if (message.log) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(new CustomEvent('friend-log-received', {
						detail: {
							log: message.log
						}
					}));
				}
			});

			apiSubscribe('sync_logs', (message: any) => {
				if (message.logs && Array.isArray(message.logs)) {
					// Emit custom event that the page can listen to
					window.dispatchEvent(new CustomEvent('sync-logs-received', {
						detail: {
							logs: message.logs,
							senderId: message.senderId,
							hasMore: message.hasMore,
							total: message.total,
							offset: message.offset,
							limit: message.limit
						}
					}));
				}
			});

			// Handle batched friend logs (with optional compression)
			apiSubscribe('batch_logs', async (message: any) => {
				try {
					let logs: any[];

					// Check if message is compressed
					if (message.compressed && message.compressedData) {
						logs = await decompressLogs(message.compressedData);
					} else {
						logs = message.logs;
					}

					if (logs && Array.isArray(logs)) {
						// Dispatch individual events for each log in the batch
						logs.forEach((log: any) => {
							window.dispatchEvent(new CustomEvent('friend-log-received', {
								detail: { log }
							}));
						});
					}
				} catch (error) {
					console.error('[Batch Decompression] Failed to decompress friend logs:', error);
				}
			});

			// Handle batched group logs (with optional compression)
			apiSubscribe('batch_group_logs', async (message: any) => {
				try {
					let logs: any[];

					// Check if message is compressed
					if (message.compressed && message.compressedData) {
						logs = await decompressLogs(message.compressedData);
					} else {
						logs = message.logs;
					}

					if (logs && Array.isArray(logs) && message.groupId) {
						// Dispatch individual events for each log in the batch
						logs.forEach((log: any) => {
							window.dispatchEvent(new CustomEvent('group-log-received', {
								detail: {
									log,
									groupId: message.groupId,
									senderId: message.senderId,
									senderUsername: message.senderUsername
								}
							}));
						});
					}
				} catch (error) {
					console.error('[Batch Group Decompression] Failed to decompress group logs:', error);
				}
			});

			console.log('[WebSocket] Connecting with user ID:', appCtx.discordUserId);
			const socket = await apiConnectWebSocket(appCtx.discordUserId);
			appCtx.ws = socket;
			console.log('[WebSocket] Connection established');

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
			appCtx.connectionStatus = 'disconnected';
			appCtx.connectionError = 'Failed to connect to server. Retrying...';
			appCtx.ws = null;
			appCtx.autoConnectionAttempted = false;

			appCtx.friendsList = appCtx.friendsList.map((friend) => ({ ...friend, isOnline: false }));
			return Promise.reject(error instanceof Error ? error : new Error('Failed to connect'));
		}
	}

	// Disconnect WebSocket
	async function disconnectWebSocket() {
		await apiDisconnectWebSocket();
		appCtx.connectionStatus = 'disconnected';
		appCtx.ws = null;
	}

	// Extract message string from Tauri WebSocket format
	function extractMessageString(msg: any): string | null {
		if (typeof msg === 'string') {
			return msg;
		} else if (msg.type === 'Text' && msg.data) {
			return msg.data;
		}
		return null; // Skip non-text messages (ping/pong/etc)
	}

	// Handle WebSocket message during authentication
	async function handleAuthWebSocketMessage(
		msg: any,
		socket: WebSocket
	): Promise<void> {
		try {
			const messageStr = extractMessageString(msg);
			if (!messageStr) return;

			const message = JSON.parse(messageStr);

			// Handle auth_complete message with JWT
			if (message.type === 'auth_complete' || message.type === 'desktop_auth_complete') {
				await processAuthComplete(message, socket);
			}

			// Handle error message
			if (message.type === 'error') {
				console.error('[Auth] ❌ Auth error:', message.message);
				appCtx.authError = message.message || 'Authentication failed';
				appCtx.connectionStatus = 'disconnected';
				appCtx.isAuthenticating = false;
			}
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				console.error('[Auth] Error handling message:', error);
			}
		}
	}

	// Process authentication completion
	async function processAuthComplete(
		message: any,
		socket: WebSocket
	): Promise<void> {
		if (!message.data?.jwt || !message.data?.user) {
			console.error('[Auth] Invalid auth_complete message - missing jwt or user');
			return;
		}

		await handleAuthComplete({
			jwt: message.data.jwt,
			user: message.data.user
		});

		// Extract user ID from JWT
		const [, payloadB64] = message.data.jwt.split('.');
		const payload = JSON.parse(atob(payloadB64));

		appCtx.discordUserId = payload.userId;
		const userData = {
			id: message.data.user.discordId,
			username: message.data.user.username,
			avatar: message.data.user.avatar
		};
		appCtx.discordUser = userData;
		appCtx.isSignedIn = true;

		// Store user ID and user data - Use autoSave with 100ms debounce for single write operation
		const store = await load('store.json', { defaults: {}, autoSave: 100 });
		await store.set('discordUserId', appCtx.discordUserId);
		await store.set('discordUser', userData);
		// No explicit save needed - autoSave will persist the change

		// Close temp auth socket and connect to main WebSocket
		try {
			await socket.disconnect();
		} catch (e) {
			console.error('[Auth] Error disconnecting temp socket:', e);
		}
		appCtx.ws = null;

		await connectWebSocket();
		appCtx.isAuthenticating = false;
	}

	// Handle sign in
	async function handleSignIn() {
		appCtx.authError = null;
		appCtx.isAuthenticating = true;

		try {
			// Connect WebSocket first to receive auth completion
			appCtx.connectionStatus = 'connecting';
			// Use dev WebSocket URL if available, otherwise production
			const wsUrl = import.meta.env.VITE_WS_URL_DEV || import.meta.env.VITE_WS_URL_PROD;

			const socket = await WebSocket.connect(wsUrl);

			// Set up message listener for auth completion
			socket.addListener(async (msg: any) => {
				await handleAuthWebSocketMessage(msg, socket);
			});

			// Generate session ID and send init message
			const sessionId = crypto.randomUUID();
			appCtx.authSessionId = sessionId;

			const initPayload = {
				type: 'init_desktop_auth',
				sessionId: sessionId,
				requestId: 'init_auth'
			};

			await socket.send(JSON.stringify(initPayload));

			appCtx.ws = socket;
			appCtx.connectionStatus = 'connected';

			// Open Discord app directly to OAuth authorization
			// Discord only accepts https:// redirect URIs, so we use website as intermediary
			const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
			const websiteUrl = import.meta.env.VITE_WEBSITE_URL_DEV || import.meta.env.VITE_WEBSITE_URL_PROD || 'https://picologs.com';
			const redirectUri = `${websiteUrl}/auth/desktop/callback`;
			const scope = 'identify';

			// Discord protocol format: discord://-/oauth2/authorize?client_id=...
			// State includes session ID so website can redirect back to desktop app
			const discordAuthUrl = `discord://-/oauth2/authorize?client_id=${discordClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${sessionId}`;

			await openUrl(discordAuthUrl);

		} catch (error) {
			console.error('[Auth] ❌ Failed to initiate auth:', error);
			appCtx.connectionStatus = 'disconnected';
			appCtx.authError = 'Failed to connect to server. Please try again.';
			appCtx.isAuthenticating = false;
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
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

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
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);
		}
	}

	// Handle denying friend request
	async function handleDenyFriend(friendshipId: string) {
		try {
			appCtx.processingFriendRequests.add(friendshipId);
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);

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
			appCtx.processingFriendRequests = new Set(appCtx.processingFriendRequests);
		}
	}

	// Handle accepting group invitation
	async function handleAcceptInvitation(invitationId: string) {
		try {
			appCtx.processingGroupInvitations.add(invitationId);
			appCtx.processingGroupInvitations = new Set(appCtx.processingGroupInvitations);

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
			appCtx.processingGroupInvitations = new Set(appCtx.processingGroupInvitations);
		}
	}

	// Handle denying group invitation
	async function handleDenyInvitation(invitationId: string) {
		try {
			appCtx.processingGroupInvitations.add(invitationId);
			appCtx.processingGroupInvitations = new Set(appCtx.processingGroupInvitations);

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
			appCtx.processingGroupInvitations = new Set(appCtx.processingGroupInvitations);
		}
	}

	// On mount - initialize authentication state
	onMount(() => {
		let unlisten: (() => void) | null = null;
		let singleInstanceUnlisten: (() => void) | null = null;

		(async () => {
			// Listen for WebSocket auth failure events
			const handleAuthFailed = async () => {
				console.log('[Layout] WebSocket auth failed, signing out user...');
				await handleSignOut();
			};
			window.addEventListener('websocket-auth-failed', handleAuthFailed);

			// Store strategy: Use autoSave with 300ms debounce for initialization read
			const store = await load('store.json', {
				defaults: {},
				autoSave: 300
			});

			// Load persisted auth state FIRST to prevent layout shift
			const storedDiscordUserId = await store.get<string>('discordUserId');
			const cachedFriendCode = await store.get<string>('friendCode');
			const cachedDiscordUser = await store.get<{ id: string; username: string; avatar: string | null }>('discordUser');
			const savedFile = await store.get<string>('lastFile');

			if (storedDiscordUserId) {
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
			console.log('[Cache] Loaded cached friends:', cachedFriends.length);
			if (cachedFriends.length > 0) {
				appCtx.friendsList = cachedFriends;
			}
			// Set loading to false after cache attempt (will show cached data or empty state)
			// WebSocket sync will refresh the data when signed in
			appCtx.isLoadingFriends = false;

			// Load groups cache
			const cachedGroups = await loadCachedGroups();
			console.log('[Cache] Loaded cached groups:', cachedGroups.length);
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
				console.log('[Auth] User is signed in, validating JWT...');
				// Validate JWT token (if expired, sign out)
				const jwtToken = await getJwtToken();

				if (jwtToken) {
					console.log('[Auth] JWT token found, loading auth data...');
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
						console.log('[WebSocket] Initiating WebSocket connection...');
						appCtx.autoConnectionAttempted = true;
						connectWebSocket().catch(() => {
							// Connection failed, allow retry after 5 seconds
							setTimeout(() => {
								appCtx.autoConnectionAttempted = false;
							}, 5000);
						});
					} else if (appCtx.ws) {
						console.log('[WebSocket] Already connected');
					} else {
						console.log('[WebSocket] Connection attempt already in progress or recently failed');
					}
				} else {
					console.log('[Auth] No JWT token found, signing out...');
					// Auth expired - sign out
					appCtx.connectionError = 'Authentication expired - please sign in again';
					await handleSignOut();
				}
			} else {
				console.log('[Auth] User not signed in or no user ID');
			}

			check().then((update: any) => {
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

						// Validate state parameter matches expected session ID
						if (!state) {
							console.error('[Deep Link] ⚠️ SECURITY: Missing state parameter in OAuth callback');
							appCtx.authError = 'Authentication failed - invalid callback (missing state)';
							appCtx.isAuthenticating = false;
							return;
						}

						if (state !== appCtx.authSessionId) {
							console.error('[Deep Link] ⚠️ SECURITY: State parameter mismatch - possible CSRF attack');
							console.error('[Deep Link] Expected:', appCtx.authSessionId, 'Received:', state);
							appCtx.authError = 'Authentication failed - session mismatch. Please try again.';
							appCtx.isAuthenticating = false;
							return;
						}

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
							return;
						}

						// Send OAuth code to server via WebSocket
						const payload = {
							type: 'discord_oauth_callback',
							requestId: 'oauth_callback',
							data: {
								code,
								sessionId: state
							}
						};

						await appCtx.ws.send(JSON.stringify(payload));
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
		isAuthenticating={appCtx.isAuthenticating}
		friendRequests={appCtx.apiFriendRequests}
		groupInvitations={appCtx.groupInvitations}
		onAcceptFriend={handleAcceptFriend}
		onDenyFriend={handleDenyFriend}
		onAcceptInvitation={handleAcceptInvitation}
		onDenyInvitation={handleDenyInvitation}
		processingFriendRequests={appCtx.processingFriendRequests}
		processingGroupInvitations={appCtx.processingGroupInvitations} />

	<div class="overflow-hidden flex flex-col">
		<!-- Main page content -->
		{#if !['/profile', '/friends', '/groups'].includes($page.url.pathname)}
			<div class="h-full">
				{@render children()}
			</div>
		{/if}

		<!-- Single persistent iframe for all pages with back button -->
		{#if iframeMounted && currentIframePage}
			<div class="h-full flex flex-col" class:hidden={!['/profile', '/friends', '/groups'].includes($page.url.pathname)}>
				<Iframe page={currentIframePage} />
			</div>
		{/if}
	</div>
</div>

<!-- Notification toasts -->
<NotificationToasts />

