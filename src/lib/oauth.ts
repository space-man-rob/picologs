import { openUrl } from '@tauri-apps/plugin-opener';
import { load as loadStore } from '@tauri-apps/plugin-store';
import { fetch } from '@tauri-apps/plugin-http';

const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;
const DISCORD_API_ENDPOINT = import.meta.env.VITE_DISCORD_API_ENDPOINT;
const DISCORD_OAUTH_URL = import.meta.env.VITE_DISCORD_OAUTH_URL;
const AUTH_CALLBACK_URL = import.meta.env.VITE_AUTH_BRIDGE_URL;

interface DiscordTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token: string;
	scope: string;
}

interface DiscordUser {
	id: string;
	username: string;
	discriminator: string;
	avatar: string | null;
	global_name: string | null;
}

interface AuthResult {
	user: DiscordUser;
	tokens: DiscordTokenResponse;
}

/**
 * Listener for auth complete (via deep link)
 */
let authCompleteCallback: ((result: AuthResult) => void) | null = null;

/**
 * Handle Discord auth complete from deep link
 * This should be called when the app receives a deep link with auth data
 */
export async function handleAuthComplete(data: {
	user: DiscordUser;
	tokens: DiscordTokenResponse;
	jwtToken?: string;
	dbUser?: {
		id: string;
		discordId: string;
		username: string;
		avatar: string | null;
		player: string | null;
		friendCode: string | null;
	};
}) {
	console.log('[OAuth] Discord auth complete received!');

	// Store dbUser info and JWT token FIRST before resolving callback
	if (data.dbUser || data.jwtToken) {
		try {
			const store = await loadStore('auth.json', { defaults: {}, autoSave: false });
			const dbUserInfo = {
				...data.dbUser,
				jwtToken: data.jwtToken
			};
			await store.set('db_user_info', dbUserInfo);
			await store.save();
			if (data.jwtToken) {
				console.log('[OAuth] Stored JWT token for WebSocket authentication');
			}
			if (data.dbUser) {
				console.log('[OAuth] Stored database user info with friend code:', data.dbUser.friendCode);
			}
		} catch (error) {
			console.error('[OAuth] Error storing database user info:', error);
		}
	}

	// Now resolve the callback
	if (authCompleteCallback) {
		authCompleteCallback({ user: data.user, tokens: data.tokens });
		authCompleteCallback = null; // Clear callback after use
	} else {
		console.log('[OAuth] No auth callback registered!');
	}
}

/**
 * Store authentication data in Tauri store
 */
async function storeAuthData(
	user: DiscordUser,
	tokens: DiscordTokenResponse,
	dbUser?: {
		id: string;
		discordId: string;
		username: string;
		avatar: string | null;
		player: string | null;
		friendCode: string | null;
	}
): Promise<void> {
	const store = await loadStore('auth.json', {
		defaults: {},
		autoSave: false
	});
	await store.set('discord_access_token', tokens.access_token);
	await store.set('discord_refresh_token', tokens.refresh_token);
	await store.set('discord_user', user);
	await store.set('discord_expires_at', Date.now() + tokens.expires_in * 1000);

	// Store database user info if provided (needed for API authentication)
	if (dbUser) {
		await store.set('db_user_info', dbUser);
		console.log('[OAuth] Stored database user info with friend code:', dbUser.friendCode);
	}

	await store.save();
}

/**
 * Initiate Discord OAuth flow using system browser with WebSocket callback
 * @param userId - The desktop app's user ID to receive auth callback
 */
export async function loginWithDiscord(userId: string): Promise<AuthResult> {
	return new Promise(async (resolve, reject) => {
		try {
			console.log('[OAuth] Starting login with userId:', userId);

			// Set up callback for when auth completes via WebSocket
			authCompleteCallback = async (result: AuthResult) => {
				try {
					console.log('[OAuth] Received auth complete callback');
					// Store auth data
					await storeAuthData(result.user, result.tokens);
					resolve(result);
				} catch (err) {
					reject(err);
				}
			};

			// Build Discord OAuth URL with userId as state parameter
			const authUrl = new URL(DISCORD_OAUTH_URL);
			authUrl.searchParams.set('client_id', DISCORD_CLIENT_ID);
			authUrl.searchParams.set('response_type', 'code');
			authUrl.searchParams.set('redirect_uri', AUTH_CALLBACK_URL);
			authUrl.searchParams.set('scope', 'identify');
			authUrl.searchParams.set('state', userId); // Pass userId so callback can send auth data back

			console.log('[OAuth] Opening browser with state:', userId);

			// Open system browser
			await openUrl(authUrl.toString());

			// Set timeout in case user never completes auth
			setTimeout(() => {
				if (authCompleteCallback) {
					authCompleteCallback = null;
					reject(new Error('Authentication timed out'));
				}
			}, 5 * 60 * 1000); // 5 minute timeout
		} catch (error) {
			authCompleteCallback = null;
			reject(error);
		}
	});
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<DiscordTokenResponse> {
	const response = await fetch(`${DISCORD_API_ENDPOINT}/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: refreshToken,
			client_id: DISCORD_CLIENT_ID
		})
	});

	if (!response.ok) {
		throw new Error('Token refresh failed');
	}

	return await response.json();
}

/**
 * Load stored authentication data
 */
export async function loadAuthData(): Promise<{ user: DiscordUser; expiresAt: number } | null> {
	try {
		const store = await loadStore('auth.json', { defaults: {} });
		const accessToken = (await store.get('discord_access_token')) as string;
		const refreshToken = (await store.get('discord_refresh_token')) as string;
		const user = (await store.get('discord_user')) as DiscordUser;
		const expiresAt = (await store.get('discord_expires_at')) as number;

		if (!accessToken || !user) {
			return null;
		}

		// Check if token is expired or expiring soon (within 1 minute)
		if (Date.now() >= expiresAt - 60000) {
			// Refresh token
			try {
				const newTokens = await refreshAccessToken(refreshToken);
				await store.set('discord_access_token', newTokens.access_token);
				await store.set('discord_refresh_token', newTokens.refresh_token);
				await store.set('discord_expires_at', Date.now() + newTokens.expires_in * 1000);
				await store.save();

				return { user, expiresAt: Date.now() + newTokens.expires_in * 1000 };
			} catch (error) {
				console.error('Token refresh failed:', error);
				// Clear tokens, user needs to re-authenticate
				await store.clear();
				await store.save();
				return null;
			}
		}

		return { user, expiresAt };
	} catch (error) {
		console.error('Failed to load auth data:', error);
		return null;
	}
}

/**
 * Sign out and clear stored tokens
 */
export async function signOut(): Promise<void> {
	const store = await loadStore('auth.json', { defaults: {} });
	const accessToken = (await store.get('discord_access_token')) as string;

	// Revoke Discord token (optional but recommended)
	if (accessToken) {
		try {
			await fetch(`${DISCORD_API_ENDPOINT}/oauth2/token/revoke`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({
					token: accessToken,
					client_id: DISCORD_CLIENT_ID
				})
			});
		} catch (error) {
			console.error('Token revocation failed:', error);
		}
	}

	// Clear local storage
	await store.clear();
	await store.save();
}

/**
 * Get stored access token
 */
export async function getAccessToken(): Promise<string | null> {
	try {
		const store = await loadStore('auth.json', { defaults: {} });
		return (await store.get('discord_access_token')) as string;
	} catch (error) {
		console.error('Failed to get access token:', error);
		return null;
	}
}

/**
 * Get stored JWT token (from database authentication)
 */
export async function getJwtToken(): Promise<string | null> {
	try {
		const store = await loadStore('auth.json', { defaults: {} });

		// Check for JWT in direct storage (new OTP-based auth flow)
		const jwtToken = (await store.get('jwtToken')) as string | null;
		if (jwtToken) {
			console.log('[OAuth] Found JWT token in direct storage');
			return jwtToken;
		}

		// Fallback to old location for backwards compatibility
		const dbUserInfo = (await store.get('db_user_info')) as any;
		if (dbUserInfo?.jwtToken) {
			console.log('[OAuth] Found JWT token in db_user_info (legacy)');
			return dbUserInfo.jwtToken;
		}

		console.log('[OAuth] No JWT token found in storage');
		return null;
	} catch (error) {
		console.error('Failed to get JWT token:', error);
		return null;
	}
}
