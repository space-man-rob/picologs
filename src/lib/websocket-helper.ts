/**
 * Unified WebSocket connection helper
 * Provides a clean Promise-based API for WebSocket connections with timeout protection
 */

import WebSocket from '@tauri-apps/plugin-websocket';

export interface WebSocketConnectionOptions {
	url: string;
	timeout?: number;
	onMessage?: (msg: any) => void | Promise<void>;
	onClose?: (code?: number) => void;
}

export interface WebSocketConnectionResult {
	socket: WebSocket;
	send: (data: string) => Promise<void>;
	disconnect: () => Promise<void>;
}

const DEFAULT_CONNECTION_TIMEOUT = 10000; // 10 seconds
const DEFAULT_SEND_TIMEOUT = 5000; // 5 seconds

/**
 * Create a WebSocket connection with timeout protection
 * Returns a Promise that resolves with socket utilities or rejects with error
 */
export async function createWebSocketConnection(
	options: WebSocketConnectionOptions
): Promise<WebSocketConnectionResult> {
	const { url, timeout = DEFAULT_CONNECTION_TIMEOUT, onMessage, onClose } = options;

	try {
		// Connect with timeout protection
		const socket = await Promise.race([
			WebSocket.connect(url),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error('Connection timeout - server is unreachable')),
					timeout
				)
			)
		]);

		// Set up message listener if provided
		if (onMessage) {
			socket.addListener(async (msg: any) => {
				await onMessage(msg);
			});
		}

		// Set up close listener if provided
		if (onClose) {
			socket.addListener((msg: any) => {
				if (msg.type === 'Close' || msg.type === 'close') {
					onClose(msg.code || msg.data?.code);
				}
			});
		}

		// Return socket utilities
		return {
			socket,
			send: async (data: string) => {
				await Promise.race([
					socket.send(data),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error('Send timeout - server not responding')),
							DEFAULT_SEND_TIMEOUT
						)
					)
				]);
			},
			disconnect: async () => {
				await socket.disconnect();
			}
		};
	} catch (error) {
		// Re-throw with enhanced error message
		const errorMessage =
			error instanceof Error && error.message.includes('timeout')
				? "Can't connect to server - connection timed out"
				: `Failed to connect to ${url}`;

		throw new Error(errorMessage, { cause: error });
	}
}

/**
 * Send a JSON message with timeout protection
 */
export async function sendJsonMessage(
	socket: WebSocket,
	data: any,
	timeout: number = DEFAULT_SEND_TIMEOUT
): Promise<void> {
	await Promise.race([
		socket.send(JSON.stringify(data)),
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Send timeout - server not responding')), timeout)
		)
	]);
}

/**
 * Extract message string from Tauri WebSocket format
 */
export function extractMessageString(msg: any): string | null {
	if (typeof msg === 'string') {
		return msg;
	} else if (msg.type === 'Text' && msg.data) {
		return msg.data;
	} else if (msg.data && typeof msg.data === 'string') {
		return msg.data;
	}
	return null; // Skip non-text messages (ping/pong/etc)
}

/**
 * Parse JSON message from WebSocket
 */
export function parseJsonMessage<T = any>(msg: any): T | null {
	const messageStr = extractMessageString(msg);
	if (!messageStr) return null;

	try {
		return JSON.parse(messageStr) as T;
	} catch (error) {
		console.error('[WebSocket] Failed to parse JSON message:', error);
		return null;
	}
}
