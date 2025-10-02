/**
 * API client for communicating with the Picologs website backend
 * Uses Discord OAuth tokens for authentication
 */

import { fetch } from '@tauri-apps/plugin-http';

const API_URL = import.meta.env.DEV
	? 'http://localhost:5173'
	: 'https://picologs.com';

/**
 * Friend data from API
 */
export interface ApiFriend {
	id: string;
	status: string;
	createdAt: string;
	friendUserId: string;
	friendDiscordId: string;
	friendUsername: string;
	friendAvatar: string | null;
	friendPlayer: string | null;
	friendTimeZone: string | null;
	friendUsePlayerAsDisplayName: boolean | null;
}

/**
 * Friend request data from API
 */
export interface ApiFriendRequest {
	id: string;
	status: string;
	createdAt: string;
	fromUserId: string;
	fromDiscordId: string;
	fromUsername: string;
	fromAvatar: string | null;
	fromPlayer: string | null;
	fromTimeZone: string | null;
	fromUsePlayerAsDisplayName: boolean | null;
	direction: 'incoming' | 'outgoing';
}

/**
 * User profile data from API
 */
export interface ApiUserProfile {
	id: string;
	discordId: string;
	username: string;
	avatar: string | null;
	player: string | null;
	timeZone: string | null;
	usePlayerAsDisplayName: boolean;
	friendCode: string | null;
	createdAt: string;
	updatedAt: string;
}

/**
 * Get authentication cookies for API requests
 */
async function getAuthCookies(): Promise<string | null> {
	// In Tauri, we need to get both the Discord token AND database user info from the auth store
	// This is populated during the OAuth flow
	try {
		const { load } = await import('@tauri-apps/plugin-store');
		const authStore = await load('auth.json', { defaults: {} });
		const discordAccessToken = await authStore.get<string>('discord_access_token');
		const dbUserInfo = await authStore.get<any>('db_user_info');

		if (!discordAccessToken) {
			console.warn('[API] No Discord token found in auth store');
			return null;
		}

		if (!dbUserInfo) {
			console.warn('[API] No database user info found in auth store');
			return null;
		}

		// Return cookies string for fetch requests
		// Need BOTH discord_token and discord_info cookies (matching website auth)
		const discordTokenCookie = `discord_token=${JSON.stringify(discordAccessToken)}`;
		const discordInfoCookie = `discord_info=${JSON.stringify({
			id: dbUserInfo.id,
			discordId: dbUserInfo.discordId,
			username: dbUserInfo.username,
			avatar: dbUserInfo.avatar,
			player: dbUserInfo.player,
			friendCode: dbUserInfo.friendCode
		})}`;

		return `${discordTokenCookie}; ${discordInfoCookie}`;
	} catch (error) {
		console.error('[API] Error loading auth cookies:', error);
		return null;
	}
}

/**
 * Fetch current user's profile from API
 */
export async function fetchUserProfile(): Promise<ApiUserProfile | null> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot fetch user profile - not authenticated');
			return null;
		}

		const response = await fetch(`${API_URL}/api/user/getProfile`, {
			method: 'GET',
			headers: {
				'Cookie': cookies
			},
			credentials: 'include'
		});

		if (!response.ok) {
			console.error('[API] Failed to fetch user profile:', response.status, response.statusText);
			return null;
		}

		const data = await response.json();
		return data;
	} catch (error) {
		console.error('[API] Error fetching user profile:', error);
		return null;
	}
}

/**
 * Fetch friends list from API
 */
export async function fetchFriends(): Promise<ApiFriend[]> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot fetch friends - not authenticated');
			return [];
		}

		const response = await fetch(`${API_URL}/api/friends/getFriends`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include'
		});

		if (!response.ok) {
			console.error('[API] Failed to fetch friends:', response.status, response.statusText);
			return [];
		}

		const data = await response.json();
		return data || [];
	} catch (error) {
		console.error('[API] Error fetching friends:', error);
		return [];
	}
}

/**
 * Fetch pending friend requests from API
 */
export async function fetchFriendRequests(): Promise<ApiFriendRequest[]> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot fetch friend requests - not authenticated');
			return [];
		}

		const response = await fetch(`${API_URL}/api/friends/getPendingFriendRequests`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include'
		});

		if (!response.ok) {
			console.error('[API] Failed to fetch friend requests:', response.status, response.statusText);
			return [];
		}

		const data = await response.json();
		return data || [];
	} catch (error) {
		console.error('[API] Error fetching friend requests:', error);
		return [];
	}
}

/**
 * Send friend request by friend code
 */
export async function sendFriendRequest(friendCode: string): Promise<boolean> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot send friend request - not authenticated');
			return false;
		}

		const response = await fetch(`${API_URL}/api/friends/sendFriendRequest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include',
			body: JSON.stringify({ friendCode })
		});

		if (!response.ok) {
			const error = await response.json();
			console.error('[API] Failed to send friend request:', error);
			return false;
		}

		return true;
	} catch (error) {
		console.error('[API] Error sending friend request:', error);
		return false;
	}
}

/**
 * Accept friend request
 */
export async function acceptFriendRequest(friendshipId: string): Promise<boolean> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot accept friend request - not authenticated');
			return false;
		}

		const response = await fetch(`${API_URL}/api/friends/acceptFriendRequest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include',
			body: JSON.stringify({ friendshipId })
		});

		if (!response.ok) {
			console.error('[API] Failed to accept friend request:', response.status);
			return false;
		}

		return true;
	} catch (error) {
		console.error('[API] Error accepting friend request:', error);
		return false;
	}
}

/**
 * Deny friend request
 */
export async function denyFriendRequest(friendshipId: string): Promise<boolean> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot deny friend request - not authenticated');
			return false;
		}

		const response = await fetch(`${API_URL}/api/friends/denyFriendRequest`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include',
			body: JSON.stringify({ friendshipId })
		});

		if (!response.ok) {
			console.error('[API] Failed to deny friend request:', response.status);
			return false;
		}

		return true;
	} catch (error) {
		console.error('[API] Error denying friend request:', error);
		return false;
	}
}

/**
 * Remove friend
 */
export async function removeFriend(friendshipId: string): Promise<boolean> {
	try {
		const cookies = await getAuthCookies();
		if (!cookies) {
			console.warn('[API] Cannot remove friend - not authenticated');
			return false;
		}

		const response = await fetch(`${API_URL}/api/friends/removeFriend`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookies
			},
			credentials: 'include',
			body: JSON.stringify({ friendshipId })
		});

		if (!response.ok) {
			console.error('[API] Failed to remove friend:', response.status);
			return false;
		}

		return true;
	} catch (error) {
		console.error('[API] Error removing friend:', error);
		return false;
	}
}
