/**
 * API client for communicating with the Picologs backend via WebSocket
 * All communication happens through WebSocket messages instead of HTTP
 */

import WebSocket from '@tauri-apps/plugin-websocket';
import { getJwtToken } from './oauth';

const WS_URL = import.meta.env.VITE_WS_URL_DEV || import.meta.env.VITE_WS_URL_PROD;

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

// WebSocket singleton and state
let ws: any = null;
let isConnected = false;
let messageHandlers = new Map<string, (data: any) => void>();
let pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();
let requestIdCounter = 0;

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
	return `req_${Date.now()}_${++requestIdCounter}`;
}

/**
 * Connect to WebSocket server
 * @param discordUserId - Discord user ID
 * @param onConnected - Callback when connected
 * @param skipAuth - Skip JWT authentication (for OAuth flow)
 */
export async function connectWebSocket(
	discordUserId: string,
	onConnected?: () => void,
	skipAuth?: boolean
): Promise<any> {
	if (ws && isConnected) {
		console.log('[WS API] Already connected');
		return ws;
	}

	try {
		console.log('[WS API] Connecting to:', WS_URL, 'skipAuth:', skipAuth);
		const socket = await WebSocket.connect(WS_URL);

		ws = socket;
		isConnected = true;

		// Set up message handler
		socket.addListener((msg: any) => {
			try {
				// Handle different message formats from Tauri WebSocket
				let messageStr: string;

				if (typeof msg === 'string') {
					messageStr = msg;
				} else if (msg.data && typeof msg.data === 'string') {
					messageStr = msg.data;
				} else if (msg.type === 'Text' && msg.data) {
					messageStr = msg.data;
				} else {
					console.log('[WS API] Received non-text message, skipping:', msg);
					return;
				}

				const message = JSON.parse(messageStr);

				console.log('[WS API] Received message:', message.type);

				// Handle request-response pattern
				if (message.requestId && pendingRequests.has(message.requestId)) {
					const { resolve, reject } = pendingRequests.get(message.requestId)!;
					pendingRequests.delete(message.requestId);

					if (message.type === 'error') {
						reject(new Error(message.error || 'Unknown error'));
					} else {
						resolve(message.data);
					}
					return;
				}

				// Handle subscribed messages
				if (messageHandlers.has(message.type)) {
					messageHandlers.get(message.type)!(message);
				}
			} catch (error) {
				console.error('[WS API] Error handling message:', error);
			}
		});

		// Get JWT token for authentication (unless skipAuth is true for OAuth flow)
		const jwtToken = await getJwtToken();
		if (!jwtToken && !skipAuth) {
			console.error('[WS API] No JWT token found - authentication required');
			throw new Error('Authentication required - please sign in again');
		}

		// Register with server
		if (jwtToken) {
			await socket.send(
				JSON.stringify({
					type: 'register',
					userId: discordUserId,
					token: jwtToken
				})
			);
			console.log('[WS API] Connected and registered with JWT token');
		} else if (skipAuth) {
			// Register without token for OAuth callback reception
			await socket.send(
				JSON.stringify({
					type: 'register',
					userId: discordUserId
				})
			);
			console.log('[WS API] Connected for OAuth flow (no JWT yet)');
		}

		// Call onConnected callback if provided
		if (onConnected) {
			onConnected();
		}

		return socket;
	} catch (error) {
		console.error('[WS API] Connection failed:', error);
		ws = null;
		isConnected = false;
		throw error;
	}
}

/**
 * Disconnect from WebSocket
 */
export async function disconnectWebSocket(): Promise<void> {
	if (ws) {
		// Clear pending requests to prevent memory leak
		pendingRequests.forEach(({ reject }) => {
			reject(new Error('WebSocket disconnected'));
		});
		pendingRequests.clear();

		try {
			await ws.disconnect();
		} catch (error) {
			console.error('[WS API] Error disconnecting:', error);
		}
		ws = null;
		isConnected = false;
		messageHandlers.clear();
	}
}

/**
 * Subscribe to WebSocket message types
 */
export function subscribe(messageType: string, handler: (data: any) => void): () => void {
	messageHandlers.set(messageType, handler);
	return () => messageHandlers.delete(messageType);
}

/**
 * Send request via WebSocket and wait for response
 */
async function sendRequest<T>(type: string, data?: any): Promise<T> {
	if (!ws || !isConnected) {
		throw new Error('WebSocket not connected');
	}

	const requestId = generateRequestId();

	return new Promise((resolve, reject) => {
		// Set timeout for request
		const timeout = setTimeout(() => {
			pendingRequests.delete(requestId);
			reject(new Error(`Request timeout: ${type}`));
		}, 30000); // 30 second timeout

		pendingRequests.set(requestId, {
			resolve: (value) => {
				clearTimeout(timeout);
				resolve(value);
			},
			reject: (error) => {
				clearTimeout(timeout);
				reject(error);
			}
		});

		ws.send(JSON.stringify({
			type,
			requestId,
			data: data || {}
		})).catch((error: any) => {
			clearTimeout(timeout);
			pendingRequests.delete(requestId);
			reject(error);
		});
	});
}

/**
 * Fetch current user's profile from API via WebSocket
 */
export async function fetchUserProfile(): Promise<ApiUserProfile | null> {
	try {
		const profile = await sendRequest<ApiUserProfile>('get_user_profile');
		return profile;
	} catch (error) {
		console.error('[WS API] Error fetching user profile:', error);
		return null;
	}
}

/**
 * Fetch friends list from API via WebSocket
 */
export async function fetchFriends(): Promise<ApiFriend[]> {
	try {
		const friends = await sendRequest<ApiFriend[]>('get_friends');
		return friends || [];
	} catch (error) {
		console.error('[WS API] Error fetching friends:', error);
		return [];
	}
}

/**
 * Fetch pending friend requests from API via WebSocket
 */
export async function fetchFriendRequests(): Promise<ApiFriendRequest[]> {
	try {
		const requests = await sendRequest<ApiFriendRequest[]>('get_friend_requests');
		return requests || [];
	} catch (error) {
		console.error('[WS API] Error fetching friend requests:', error);
		return [];
	}
}

/**
 * Send friend request by friend code via WebSocket
 */
export async function sendFriendRequest(friendCode: string): Promise<boolean> {
	try {
		await sendRequest('send_friend_request', { friendCode });
		return true;
	} catch (error) {
		console.error('[WS API] Error sending friend request:', error);
		return false;
	}
}

/**
 * Accept friend request via WebSocket
 */
export async function acceptFriendRequest(friendshipId: string): Promise<boolean> {
	try {
		await sendRequest('accept_friend_request', { friendshipId });
		return true;
	} catch (error) {
		console.error('[WS API] Error accepting friend request:', error);
		return false;
	}
}

/**
 * Deny friend request via WebSocket
 */
export async function denyFriendRequest(friendshipId: string): Promise<boolean> {
	try {
		await sendRequest('deny_friend_request', { friendshipId });
		return true;
	} catch (error) {
		console.error('[WS API] Error denying friend request:', error);
		return false;
	}
}

/**
 * Remove friend via WebSocket
 */
export async function removeFriend(friendshipId: string): Promise<boolean> {
	try {
		await sendRequest('remove_friend', { friendshipId });
		return true;
	} catch (error) {
		console.error('[WS API] Error removing friend:', error);
		return false;
	}
}

/**
 * Get WebSocket instance (for backward compatibility)
 */
export function getWebSocket(): any {
	return ws;
}

/**
 * Check if WebSocket is connected
 */
export function isWebSocketConnected(): boolean {
	return isConnected;
}
