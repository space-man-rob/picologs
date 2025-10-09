/**
 * Unified WebSocket message sending library with timeout protection
 * Provides high-level functions for all WebSocket message types in Picologs
 */

import type { WebSocketSocket } from './appContext.svelte';
import type { Log, LogTransmit } from '../types';
import { toLogTransmit } from '../types';
import { sendJsonMessage } from './websocket-helper';

const DEFAULT_SEND_TIMEOUT = 5000; // 5 seconds

/**
 * Send sync_logs message to request log sync from a friend
 *
 * Uses LogTransmit format to exclude 'original' field and reduce bandwidth.
 */
export async function sendSyncLogsRequest(
	ws: WebSocketSocket,
	params: {
		targetUserId: string;
		logs: Log[];
		since: string | null;
		limit: number;
		offset: number;
	}
): Promise<void> {
	// Convert logs to transmission format (removes 'original' field)
	const transmitLogs: LogTransmit[] = params.logs.map(toLogTransmit);

	await sendJsonMessage(
		ws,
		{
			type: 'sync_logs',
			targetUserId: params.targetUserId,
			logs: transmitLogs,
			since: params.since,
			limit: params.limit,
			offset: params.offset
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send batch_logs message to broadcast batched logs to friends
 *
 * Uses LogTransmit format to exclude 'original' field and reduce bandwidth.
 * Note: When using compression, the compressed data is already in LogTransmit format.
 */
export async function sendBatchLogs(
	ws: WebSocketSocket,
	logs: Log[],
	compressed: boolean = false,
	compressedData?: string
): Promise<void> {
	const message: Record<string, unknown> = {
		type: 'batch_logs'
	};

	if (compressed && compressedData) {
		// Compressed data already contains optimized logs
		message.compressed = true;
		message.compressedData = compressedData;
	} else {
		// Convert logs to transmission format (removes 'original' field)
		message.logs = logs.map(toLogTransmit);
	}

	await sendJsonMessage(ws, message, DEFAULT_SEND_TIMEOUT);
}

/**
 * Send batch_group_logs message to broadcast batched logs to a group
 *
 * Uses LogTransmit format to exclude 'original' field and reduce bandwidth.
 * Note: When using compression, the compressed data is already in LogTransmit format.
 */
export async function sendBatchGroupLogs(
	ws: WebSocketSocket,
	groupId: string,
	logs: Log[],
	compressed: boolean = false,
	compressedData?: string
): Promise<void> {
	const message: Record<string, unknown> = {
		type: 'batch_group_logs',
		groupId
	};

	if (compressed && compressedData) {
		// Compressed data already contains optimized logs
		message.compressed = true;
		message.compressedData = compressedData;
	} else {
		// Convert logs to transmission format (removes 'original' field)
		message.logs = logs.map(toLogTransmit);
	}

	await sendJsonMessage(ws, message, DEFAULT_SEND_TIMEOUT);
}

/**
 * Send update_user_profile message to update player info on server
 */
export async function sendUpdateMyDetails(
	ws: WebSocketSocket,
	params: {
		player: string;
		timeZone: string;
		usePlayerAsDisplayName: boolean;
	}
): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'update_user_profile',
			data: {
				player: params.player,
				timeZone: params.timeZone,
				usePlayerAsDisplayName: params.usePlayerAsDisplayName
			}
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send single log message to friends
 */
export async function sendLog(ws: WebSocketSocket, log: Log): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'log',
			log
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send group log message to a specific group
 */
export async function sendGroupLog(ws: WebSocketSocket, groupId: string, log: Log): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'group_log',
			groupId,
			log
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send friend request by friend code
 */
export async function sendFriendRequestByCode(ws: WebSocketSocket, friendCode: string): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'friend_request_by_code',
			friendCode
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send friend request response (accept/deny)
 */
export async function sendFriendRequestResponse(
	ws: WebSocketSocket,
	requestId: string,
	accept: boolean
): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: accept ? 'friend_request_response_accept' : 'friend_request_response_deny',
			requestId
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send ping message for keepalive
 */
export async function sendPing(ws: WebSocketSocket): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'ping'
		},
		DEFAULT_SEND_TIMEOUT
	);
}

/**
 * Send pong message in response to ping
 */
export async function sendPong(ws: WebSocketSocket): Promise<void> {
	await sendJsonMessage(
		ws,
		{
			type: 'pong'
		},
		DEFAULT_SEND_TIMEOUT
	);
}
