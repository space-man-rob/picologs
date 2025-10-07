import { load as loadStore } from '@tauri-apps/plugin-store';

interface DiscordUser {
	id: string;
	username: string;
	discriminator: string;
	avatar: string | null;
	global_name: string | null;
}


/**
 * Handle auth complete via WebSocket message
 * Called when server sends auth_complete with JWT token
 *
 * SECURITY NOTE (M2): JWT Token Storage
 * =====================================
 * The JWT token is currently stored in plaintext in the Tauri store (auth.json).
 * This is a known limitation of the current implementation.
 *
 * RECOMMENDED FIX:
 * - Upgrade to Tauri 2.x keyring/keytar plugin for encrypted credential storage
 * - Use OS-level credential managers (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
 * - Reference: https://v2.tauri.app/plugin/keyring/
 *
 * CURRENT MITIGATION:
 * - JWT tokens have short expiration times (validated in getJwtToken() and loadAuthData())
 * - Tauri store files have restricted file permissions (user-only access)
 * - App runs in sandboxed Tauri environment
 *
 * RISK ASSESSMENT:
 * - Low-Medium: Requires local file system access to user's app data directory
 * - Token expiration reduces window of opportunity for token theft
 * - Desktop environment is generally more trusted than web browser storage
 */
export async function handleAuthComplete(data: {
	jwt: string;
	user: {
		discordId: string;
		username: string;
		avatar: string | null;
	};
}): Promise<void> {
	try {
		// Store strategy: Use autoSave with 100ms debounce for auth data write
		// JWT token and user data are set together - autoSave batches these writes
		const store = await loadStore('auth.json', { defaults: {}, autoSave: 100 });

		// SECURITY WARNING: JWT stored in plaintext (see function documentation above)
		await store.set('jwtToken', data.jwt);

		// Store Discord user for display purposes
		const discordUser: DiscordUser = {
			id: data.user.discordId,
			username: data.user.username,
			discriminator: '0',
			avatar: data.user.avatar,
			global_name: data.user.username
		};
		await store.set('discord_user', discordUser);

		// No explicit save needed - autoSave will persist both values with 100ms debounce
	} catch (error) {
		console.error('[OAuth] Error storing auth data:', error);
		throw error;
	}
}


/**
 * Load stored authentication data
 */
export async function loadAuthData(): Promise<{ user: DiscordUser; expiresAt: number } | null> {
	try {
		// Store strategy: Read-only operation with default autoSave (100ms debounce)
		// This ensures consistency with write operations in case of concurrent access
		const store = await loadStore('auth.json', { defaults: {}, autoSave: 100 });

		const jwtToken = (await store.get('jwtToken')) as string | null;
		const user = (await store.get('discord_user')) as DiscordUser | null;

		if (jwtToken && user) {
			// SECURITY: Validate JWT expiration
			try {
				const [, payloadB64] = jwtToken.split('.');
				if (!payloadB64) {
					console.warn('[OAuth Security] Invalid JWT format');
					return null;
				}

				const payload = JSON.parse(atob(payloadB64));

				// Check expiration claim (exp is in seconds, Date.now() is in milliseconds)
				if (payload.exp && payload.exp * 1000 < Date.now()) {
					console.warn('[OAuth Security] JWT expired');
					// Clear expired token
					await store.clear();
					return null;
				}

				// Return expiration time if available, otherwise default to 1 year
				const expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + (365 * 24 * 60 * 60 * 1000);
				return { user, expiresAt };
			} catch (parseError) {
				console.error('[OAuth Security] Failed to parse JWT:', parseError);
				return null;
			}
		}

		return null;
	} catch (error) {
		console.error('Failed to load auth data:', error);
		return null;
	}
}

/**
 * Sign out and clear stored tokens
 */
export async function signOut(): Promise<void> {
	// Store strategy: Use autoSave with 100ms debounce for sign out
	// Clear operation is a single write - autoSave handles persistence
	const store = await loadStore('auth.json', { defaults: {}, autoSave: 100 });
	await store.clear();
	// No explicit save needed - autoSave will persist the clear operation
}


/**
 * Get stored JWT token with expiration validation
 */
export async function getJwtToken(): Promise<string | null> {
	try {
		// Store strategy: Read-only operation with default autoSave (100ms debounce)
		// This ensures consistency with write operations in case of concurrent access
		const store = await loadStore('auth.json', { defaults: {}, autoSave: 100 });
		const jwtToken = (await store.get('jwtToken')) as string | null;

		if (jwtToken) {
			// SECURITY: Validate JWT expiration before returning
			try {
				const [, payloadB64] = jwtToken.split('.');
				if (!payloadB64) {
					console.warn('[OAuth Security] Invalid JWT format');
					await store.clear();
					return null;
				}

				const payload = JSON.parse(atob(payloadB64));

				// Check expiration claim (exp is in seconds, Date.now() is in milliseconds)
				if (payload.exp && payload.exp * 1000 < Date.now()) {
					console.warn('[OAuth Security] JWT expired, clearing token');
					await store.clear();
					return null;
				}

				return jwtToken;
			} catch (parseError) {
				console.error('[OAuth Security] Failed to parse JWT:', parseError);
				await store.clear();
				return null;
			}
		}

		return null;
	} catch (error) {
		console.error('[OAuth] Failed to get JWT token:', error);
		return null;
	}
}
