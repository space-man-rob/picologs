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

		// Store JWT token
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
			// JWT expiry would need to be checked separately if needed
			// For now, treat as long-lived session
			return { user, expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000) };
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
 * Get stored JWT token
 */
export async function getJwtToken(): Promise<string | null> {
	try {
		// Store strategy: Read-only operation with default autoSave (100ms debounce)
		// This ensures consistency with write operations in case of concurrent access
		const store = await loadStore('auth.json', { defaults: {}, autoSave: 100 });
		const jwtToken = (await store.get('jwtToken')) as string | null;

		if (jwtToken) {
			return jwtToken;
		}

		return null;
	} catch (error) {
		console.error('[OAuth] Failed to get JWT token:', error);
		return null;
	}
}
