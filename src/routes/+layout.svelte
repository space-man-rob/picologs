<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { load } from '@tauri-apps/plugin-store';
	import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
	import { check } from '@tauri-apps/plugin-updater';
	import WebSocket from '@tauri-apps/plugin-websocket';
	import { openUrl } from '@tauri-apps/plugin-opener';
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

		const sessionId = crypto.randomUUID();
		appCtx.authSessionId = sessionId;

		console.log('[Auth] Starting new OTP auth flow with session ID:', sessionId);

		try {
			appCtx.connectionStatus = 'connecting';
			const wsUrl = import.meta.env.DEV
				? 'ws://127.0.0.1:8080/ws'
				: 'wss://picologs-ws.fly.dev/ws';

			console.log('[Auth] Connecting to WebSocket:', wsUrl);
			const socket = await WebSocket.connect(wsUrl);

			socket.addListener((msg: any) => {
				try {
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

					if (message.type === 'otp_ready' && message.sessionId === sessionId) {
						console.log('[Auth] OTP is ready, waiting for user to enter code');
						appCtx.awaitingOtp = true;
					}

					if (message.type === 'response' && message.requestId === 'verify_otp') {
						if (message.data?.success && message.data?.jwt) {
							console.log('[Auth] OTP verified! Received JWT token');
							appCtx.jwtToken = message.data.jwt;
							completeAuth(message.data.jwt);
						} else {
							console.error('[Auth] OTP verification failed:', message.message);
							appCtx.authError = message.message || 'Invalid OTP code';
						}
					}

					if (message.type === 'error') {
						console.error('[Auth] WebSocket error:', message.message);
						appCtx.authError = message.message;
					}
				} catch (error) {
					if (error instanceof SyntaxError) {
						console.log('[Auth WS] Skipping non-JSON message');
					} else {
						console.error('[Auth WS] Error handling message:', error);
					}
				}
			});

			await socket.send(JSON.stringify({
				type: 'init_desktop_auth',
				sessionId: sessionId,
				requestId: 'init_auth'
			}));

			appCtx.ws = socket;
			appCtx.connectionStatus = 'connected';
			console.log('[Auth] WebSocket connected, session initiated');

			const websiteUrl = import.meta.env.DEV
				? 'http://localhost:5173'
				: 'https://picologs.com';
			const authUrl = `${websiteUrl}/auth/desktop?session=${sessionId}`;

			console.log('[Auth] Opening browser to:', authUrl);
			await openUrl(authUrl);

		} catch (error) {
			console.error('[Auth] Failed to initiate auth:', error);
			appCtx.connectionStatus = 'disconnected';
			appCtx.authError = 'Failed to connect to server. Please try again.';
		}
	}

	// Submit OTP
	async function submitOtp() {
		if (!appCtx.otpCode || appCtx.otpCode.length !== 6 || !appCtx.authSessionId || !appCtx.ws) {
			appCtx.authError = 'Please enter a valid 6-digit code';
			return;
		}

		appCtx.authError = null;
		appCtx.isVerifyingOtp = true;

		try {
			console.log('[Auth] Submitting OTP for verification');
			await appCtx.ws.send(JSON.stringify({
				type: 'verify_otp',
				requestId: 'verify_otp',
				data: {
					sessionId: appCtx.authSessionId,
					otp: appCtx.otpCode
				}
			}));
		} catch (error) {
			console.error('[Auth] Failed to submit OTP:', error);
			appCtx.authError = 'Failed to verify code. Please try again.';
			appCtx.isVerifyingOtp = false;
		}
	}

	// Complete auth
	async function completeAuth(jwt: string) {
		try {
			const authStore = await load('auth.json', {
				defaults: {},
				autoSave: false
			});
			await authStore.set('jwtToken', jwt);
			await authStore.save();

			const [, payloadB64] = jwt.split('.');
			const payload = JSON.parse(atob(payloadB64));

			appCtx.discordUserId = payload.userId;
			appCtx.isSignedIn = true;

			console.log('[Auth] Authentication complete! Discord user ID:', appCtx.discordUserId);

			const store = await load('store.json', {
				defaults: {},
				autoSave: false
			});
			await store.set('discordUserId', appCtx.discordUserId);
			await store.save();

			appCtx.awaitingOtp = false;
			appCtx.otpCode = '';
			appCtx.authSessionId = null;
			appCtx.authError = null;

			if (appCtx.ws) {
				try {
					await appCtx.ws.disconnect();
				} catch (error) {
					console.error('[WebSocket] Error disconnecting:', error);
				}
			}
			appCtx.ws = null;

			await apiDisconnectWebSocket();
			await connectWebSocket();

			try {
				const profile = await fetchUserProfile();
				if (profile) {
					const discordUserData = {
						id: profile.discordId,
						username: profile.username,
						discriminator: '0',
						avatar: profile.avatar,
						global_name: profile.username
					};
					await authStore.set('discord_user', discordUserData);
					await authStore.save();

					appCtx.discordUser = {
						id: profile.discordId,
						username: profile.username,
						avatar: profile.avatar
					};

					console.log('[Auth] User profile loaded and persisted');
				}
			} catch (error) {
				console.error('[Auth] Failed to fetch user profile:', error);
			}

		} catch (error) {
			console.error('[Auth] Failed to complete authentication:', error);
			appCtx.authError = 'Failed to complete sign in. Please try again.';
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

			unlisten = await onOpenUrl(async (urls) => {
				console.log('[Deep Link] Received URLs:', urls);

				for (const url of urls) {
					try {
						console.log('[Deep Link] Processing URL:', url);
						const urlObj = new URL(url);
						console.log('[Deep Link] Protocol:', urlObj.protocol, 'Hostname:', urlObj.hostname);

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
		})();

		return () => {
			if (unlisten) {
				unlisten();
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
		connectionError={appCtx.connectionError} />

	<div class="overflow-hidden">
		{@render children()}
	</div>
</div>

<!-- OTP Input Modal -->
{#if appCtx.awaitingOtp}
	<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
		<div class="bg-[rgb(10,30,42)] border border-white/20 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
			{#if appCtx.isVerifyingOtp}
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
					bind:value={appCtx.otpCode}
					placeholder="000000"
					maxlength="6"
					class="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white text-center text-2xl tracking-widest font-mono mb-4 focus:outline-none focus:border-blue-500"
					onkeydown={(e) => {
						if (e.key === 'Enter') {
							submitOtp();
						}
					}}
				/>

				{#if appCtx.authError}
					<div class="bg-red-900/20 border border-red-500/50 rounded-lg px-4 py-3 mb-4 text-red-400 text-sm">
						{appCtx.authError}
					</div>
				{/if}

				<div class="flex gap-3">
					<button
						onclick={() => {
							appCtx.awaitingOtp = false;
							appCtx.otpCode = '';
							appCtx.authError = null;
						}}
						class="flex-1 px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white hover:bg-white/10 transition-colors">
						Cancel
					</button>
					<button
						onclick={submitOtp}
						disabled={appCtx.otpCode.length !== 6}
						class="flex-1 px-4 py-2 bg-blue-600 border border-blue-500 rounded-lg text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
						Verify
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
