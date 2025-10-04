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
	import { setAppContext } from '$lib/appContext.svelte';
	import {
		connectWebSocket as apiConnectWebSocket,
		disconnectWebSocket as apiDisconnectWebSocket,
		fetchFriends,
		fetchFriendRequests,
		fetchUserProfile,
		subscribe as apiSubscribe,
		getWebSocket
	} from '$lib/api';
	import { loadAuthData, signOut, handleAuthComplete, getJwtToken } from '$lib/oauth';
	import type { Friend as FriendType } from '../types';

	let { children } = $props();

	// Initialize shared app context
	const appCtx = setAppContext();

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
			friendCode: '',
			name: f.friendUsePlayerAsDisplayName && f.friendPlayer
				? f.friendPlayer
				: f.friendUsername,
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
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: true },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}
				}
			});

			apiSubscribe('user_offline', (message: any) => {
				if (message.userId) {
					const friendIndex = appCtx.friendsList.findIndex((f) => f.id === message.userId);
					if (friendIndex !== -1) {
						appCtx.friendsList = [
							...appCtx.friendsList.slice(0, friendIndex),
							{ ...appCtx.friendsList[friendIndex], isOnline: false },
							...appCtx.friendsList.slice(friendIndex + 1)
						];
					}
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

	// Handle sign in
	async function handleSignIn() {
		appCtx.authError = null;
		appCtx.isAuthenticating = true;

		console.log('[Auth] 🚀 Starting Discord OAuth flow');

		try {
			// Connect WebSocket first to receive auth completion
			appCtx.connectionStatus = 'connecting';
			// Use dev WebSocket URL if available, otherwise production
			const wsUrl = import.meta.env.VITE_WS_URL_DEV || import.meta.env.VITE_WS_URL_PROD || 'wss://picologs-server.fly.dev/ws';

			console.log('[Auth] 🔌 Connecting to WebSocket:', wsUrl);
			const socket = await WebSocket.connect(wsUrl);
			console.log('[Auth] ✅ WebSocket connection established');

			// Set up message listener for auth completion
			socket.addListener(async (msg: any) => {
				try {
					// Extract message string from Tauri WebSocket format
					let messageStr: string;
					if (typeof msg === 'string') {
						messageStr = msg;
					} else if (msg.type === 'Text' && msg.data) {
						messageStr = msg.data;
					} else {
						return; // Skip non-text messages (ping/pong/etc)
					}

					const message = JSON.parse(messageStr);
					console.log('[Auth] Received message:', message.type);

					// Handle auth_complete message with JWT
					if (message.type === 'auth_complete' || message.type === 'desktop_auth_complete') {
						console.log('[Auth] ✅ Authentication complete!');

						if (message.data?.jwt && message.data?.user) {
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

							// Store user ID
							const store = await load('store.json', { defaults: {}, autoSave: false });
							await store.set('discordUserId', appCtx.discordUserId);
							await store.save();

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
					}

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

			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.delete('discordUserId');
			await store.save();

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

			const store = await load('store.json', {
				defaults: {},
				autoSave: false
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

			await store.save();

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

			// Helper function to process deep link URLs
			const processDeepLink = async (url: string) => {
				try {
					console.log('[Deep Link] Processing URL:', url);
					const urlObj = new URL(url);
					console.log('[Deep Link] Protocol:', urlObj.protocol, 'Pathname:', urlObj.pathname);

					// Handle Discord OAuth callback: picologs://auth/callback?code=...&state=...
					// Note: pathname can be either '/callback' or '//auth/callback' depending on how the URL is formatted
					if (urlObj.protocol === 'picologs:' && (urlObj.pathname === '//auth/callback' || urlObj.pathname === '/callback' || urlObj.hostname === 'auth')) {
						console.log('[Deep Link] 🔐 Discord OAuth callback received');
						const code = urlObj.searchParams.get('code');
						const state = urlObj.searchParams.get('state');

						console.log('[Deep Link] Code:', code ? 'present' : 'missing');
						console.log('[Deep Link] State (session ID):', state);

						if (code && state && appCtx.ws) {
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
						} else {
							console.error('[Deep Link] ❌ Missing code or state in OAuth callback');
							appCtx.authError = 'OAuth callback failed - missing parameters';
						}
					}
					// Legacy deep link handler (for backward compatibility)
					else if (urlObj.protocol === 'picologs:' && urlObj.pathname === '//auth') {
						console.log('[Deep Link] Legacy auth protocol');
						const authDataEncoded = urlObj.searchParams.get('data');
						if (authDataEncoded) {
							const authData = JSON.parse(decodeURIComponent(authDataEncoded));
							await handleAuthComplete(authData);
						}
					} else {
						console.log('[Deep Link] URL did not match expected format');
					}
				} catch (error) {
					console.error('[Deep Link] Error parsing URL:', error);
				}
			};

			// Listen for deep links from single-instance plugin
			console.log('[Deep Link] Setting up single-instance listener...');
			const singleInstanceUnlisten = await listen<string>('deep-link-received', async (event) => {
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

	<div class="overflow-hidden">
		{@render children()}
	</div>
</div>

