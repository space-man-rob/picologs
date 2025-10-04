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
		getWebSocket
	} from '$lib/api';
	import { loadAuthData, signOut, handleAuthComplete, getJwtToken } from '$lib/oauth';
	import type { Friend as FriendType } from '../types';

	let { children } = $props();

	// Initialize shared app context
	const appCtx = setAppContext();

	// Track if iframe has been mounted
	let iframeMounted = $state(false);
	let currentIframePage = $state<'profile' | 'friends' | 'groups' | null>(null);

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
			console.log('[API] Not syncing user profile - not signed in');
			return;
		}

		console.log('[API] Fetching user profile from API...');
		const profile = await fetchUserProfile();
		if (profile) {
			appCtx.apiUserProfile = profile;

			// Also set discordUser for UI display
			appCtx.discordUser = {
				id: profile.discordId,
				username: profile.username,
				avatar: profile.avatar
			};

			console.log('[API] Synced user profile from database');
		}
	}

	// Sync friends from API
	async function syncFriendsFromAPI() {
		if (!appCtx.isSignedIn) {
			console.log('[API] Not syncing friends - not signed in');
			return;
		}

		console.log('[API] Fetching friends from API...');
		const friends = await fetchFriends();
		appCtx.apiFriends = friends;

		// Convert API friends to local format
		appCtx.friendsList = friends.map((f) => ({
			id: f.friendUserId,
			discordId: f.friendDiscordId,
			friendCode: '',
			name: f.friendUsePlayerAsDisplayName && f.friendPlayer
				? f.friendPlayer
				: f.friendUsername,
			avatar: f.friendAvatar,
			status: 'confirmed' as const,
			timezone: f.friendTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
			isOnline: false,
			isConnected: false
		}));

		console.log('[API] Synced', friends.length, 'friends');
	}

	// Sync friend requests from API
	async function syncFriendRequestsFromAPI() {
		if (!appCtx.isSignedIn) {
			console.log('[API] Not syncing friend requests - not signed in');
			return;
		}

		console.log('[API] Fetching friend requests from API...');
		const requests = await fetchFriendRequests();
		appCtx.apiFriendRequests = requests;

		console.log('[API] Synced', requests.length, 'friend requests');
	}

	// Sync groups from API
	async function syncGroupsFromAPI() {
		if (!appCtx.isSignedIn) {
			console.log('[API] Not syncing groups - not signed in');
			return;
		}

		console.log('[API] Fetching groups from API...');
		const groups = await fetchGroups();
		appCtx.groups = groups;

		// Fetch members for each group
		for (const group of groups) {
			const members = await fetchGroupMembers(group.id);
			appCtx.groupMembers.set(group.id, members);
		}

		// Fetch pending invitations
		const invitations = await fetchGroupInvitations();
		appCtx.groupInvitations = invitations;

		console.log('[API] Synced', groups.length, 'groups and', invitations.length, 'invitations');
	}

	// Connect WebSocket
	async function connectWebSocket(): Promise<void> {
		if (!appCtx.discordUserId) {
			console.log('[WebSocket] Not connecting - no user ID available');
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
				console.log('[WebSocket] ✅ Successfully registered with server');
				await syncUserProfileFromAPI();
				await syncFriendsFromAPI();
				await syncFriendRequestsFromAPI();
				await syncGroupsFromAPI();
			});

			apiSubscribe('refetch_friends', async () => {
				console.log('[WebSocket] 🔄 Received refetch_friends notification');
				await syncFriendsFromAPI();
			});

			apiSubscribe('refetch_friend_requests', async () => {
				console.log('[WebSocket] 🔄 Received refetch_friend_requests notification');
				await syncFriendRequestsFromAPI();
			});

			apiSubscribe('refetch_groups', async () => {
				console.log('[WebSocket] 🔄 Received refetch_groups notification');
				await syncGroupsFromAPI();
			});

			apiSubscribe('refetch_group_details', async (message: any) => {
				if (message.groupId) {
					console.log('[WebSocket] 🔄 Received refetch_group_details for group', message.groupId);
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
			console.log('[Auth] Received message:', message.type);

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
		console.log('[Auth] ✅ Authentication complete!');

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
		appCtx.discordUser = {
			id: message.data.user.discordId,
			username: message.data.user.username,
			avatar: message.data.user.avatar
		};
		appCtx.isSignedIn = true;

		// Store user ID - Use autoSave with 100ms debounce for single write operation
		const store = await load('store.json', { defaults: {}, autoSave: 100 });
		await store.set('discordUserId', appCtx.discordUserId);
		// No explicit save needed - autoSave will persist the change

		// Close temp auth socket and connect to main WebSocket
		try {
			await socket.disconnect();
		} catch (e) {
			console.error('[Auth] Error disconnecting temp socket:', e);
		}
		appCtx.ws = null;

		await connectWebSocket();
		console.log('[Auth] ✅ Signed in successfully');
		appCtx.isAuthenticating = false;
	}

	// Handle sign in
	async function handleSignIn() {
		appCtx.authError = null;
		appCtx.isAuthenticating = true;

		console.log('[Auth] 🚀 Starting Discord OAuth flow');

		try {
			// Connect WebSocket first to receive auth completion
			appCtx.connectionStatus = 'connecting';
			// Use dev WebSocket URL if available, otherwise production
			const wsUrl = import.meta.env.VITE_WS_URL_DEV || import.meta.env.VITE_WS_URL_PROD;

			console.log('[Auth] 🔌 Connecting to WebSocket:', wsUrl);
			const socket = await WebSocket.connect(wsUrl);
			console.log('[Auth] ✅ WebSocket connection established');

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
			console.log('[Auth] ✅ Session initialized:', sessionId);

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

			console.log('[Auth] Opening Discord app for OAuth authorization...');
			console.log('[Auth] Redirect URI:', redirectUri);
			console.log('[Auth] Session ID (state):', sessionId);
			console.log('[Auth] Full Discord URL:', discordAuthUrl);
			await openUrl(discordAuthUrl);
			console.log('[Auth] Discord app opened, waiting for user to authorize...');

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
			// No explicit save needed - autoSave will persist the deletion

			if (appCtx.ws) {
				try {
					await appCtx.ws.disconnect();
				} catch (error) {
					console.error('[WebSocket] Error disconnecting:', error);
				}
			}
			appCtx.connectionStatus = 'disconnected';

			console.log('[Auth] Successfully signed out');
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

	// On mount - initialize authentication state
	onMount(() => {
		let unlisten: (() => void) | null = null;
		let singleInstanceUnlisten: (() => void) | null = null;

		(async () => {
			const authData = await loadAuthData();
			if (authData) {
				appCtx.isSignedIn = true;
				appCtx.discordUser = {
					id: authData.user.id,
					username: authData.user.global_name || authData.user.username,
					avatar: authData.user.avatar
				};
			}

			// Store strategy: Use autoSave with 300ms debounce for initialization read
			// This allows any delayed initialization writes to be batched
			const store = await load('store.json', {
				defaults: {},
				autoSave: 300
			});

			const storedDiscordUserId = await store.get<string>('discordUserId');
			if (storedDiscordUserId) {
				appCtx.discordUserId = storedDiscordUserId;
				console.log('[Init] Loaded Discord user ID:', appCtx.discordUserId);

				const authData = await loadAuthData();
				if (authData) {
					appCtx.isSignedIn = true;
					appCtx.discordUser = {
						id: authData.user.id,
						username: authData.user.global_name || authData.user.username,
						avatar: authData.user.avatar
					};
					console.log('[Init] Restored Discord auth session');
				}
			}

			// No explicit save needed - autoSave handles any initialization changes

			// Connect WebSocket if signed in
			if (appCtx.isSignedIn && appCtx.discordUserId && !appCtx.ws) {
				const jwtToken = await getJwtToken();

				if (jwtToken) {
					connectWebSocket();
				} else {
					console.log('[Init] No JWT token found - user needs to sign in again');
					appCtx.connectionError = 'Authentication expired - please sign in again';
					await handleSignOut();
				}
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
					console.log('[Deep Link] Processing URL:', url);
					const urlObj = new URL(url);

					// Only process picologs:// protocol URLs
					if (urlObj.protocol !== 'picologs:') {
						console.log('[Deep Link] Ignoring non-picologs URL');
						return;
					}

					const normalizedPath = normalizeDeepLinkPath(urlObj);
					console.log('[Deep Link] Protocol:', urlObj.protocol, 'Normalized path:', normalizedPath);

					// Handle Discord OAuth callback
					// Expected formats: picologs://auth/callback, picologs:///auth/callback, etc.
					if (normalizedPath === 'auth/callback') {
						console.log('[Deep Link] 🔐 Discord OAuth callback received');
						const code = urlObj.searchParams.get('code');
						const state = urlObj.searchParams.get('state');

						console.log('[Deep Link] Code:', code ? 'present' : 'missing');
						console.log('[Deep Link] State (session ID):', state);
						console.log('[Deep Link] Expected session ID:', appCtx.authSessionId);

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

						// State validation passed - proceed with OAuth flow
						console.log('[Deep Link] ✅ State validation passed');

						// Send OAuth code to server via WebSocket
						const payload = {
							type: 'discord_oauth_callback',
							requestId: 'oauth_callback',
							data: {
								code,
								sessionId: state
							}
						};

						console.log('[Deep Link] Sending OAuth callback to server...');
						await appCtx.ws.send(JSON.stringify(payload));
						console.log('[Deep Link] ✅ OAuth callback sent, waiting for auth_complete...');
					}
					// Legacy deep link handler (for backward compatibility)
					// Expected format: picologs://auth?data=...
					else if (normalizedPath === 'auth') {
						console.log('[Deep Link] Legacy auth protocol');
						const authDataEncoded = urlObj.searchParams.get('data');
						if (authDataEncoded) {
							const authData = JSON.parse(decodeURIComponent(authDataEncoded));
							await handleAuthComplete(authData);
						}
					} else {
						console.log('[Deep Link] URL did not match expected format. Normalized path:', normalizedPath);
					}
				} catch (error) {
					console.error('[Deep Link] Error parsing URL:', error);
				}
			};

			// Listen for deep links from single-instance plugin
			console.log('[Deep Link] Setting up single-instance listener...');
			singleInstanceUnlisten = await listen<string>('deep-link-received', async (event) => {
				console.log('[Deep Link] ✅ Received from single-instance:', event.payload);
				await processDeepLink(event.payload);
			});
			console.log('[Deep Link] Single-instance listener registered');

			unlisten = await onOpenUrl(async (urls) => {
				console.log('[Deep Link] Received URLs:', urls);
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
</script>

<div class="h-dvh overflow-hidden grid grid-rows-[auto_1fr]">
	<Header
		friendCode={appCtx.apiUserProfile?.friendCode}
		{connectWebSocket}
		connectionStatus={appCtx.connectionStatus}
		bind:copiedStatusVisible={appCtx.copiedStatusVisible}
		selectFile={appCtx.pageActions.selectFile || (() => {})}
		bind:logLocation={appCtx.pageActions.logLocation}
		clearLogs={appCtx.pageActions.clearLogs || (() => {})}
		{updateInfo}
		{installUpdate}
		isSignedIn={appCtx.isSignedIn}
		discordUser={appCtx.discordUser}
		{handleSignIn}
		{handleSignOut}
		connectionError={appCtx.connectionError}
		isAuthenticating={appCtx.isAuthenticating} />

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

