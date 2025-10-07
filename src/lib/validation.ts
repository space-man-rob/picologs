/**
 * Zod schemas for validating WebSocket messages
 * SECURITY: Prevents message injection attacks by validating all incoming data
 */

import { z } from 'zod';

// Maximum string lengths to prevent DoS attacks
const MAX_STRING_LENGTH = 1000;
const MAX_LOG_CONTENT = 2000;
const MAX_USERNAME_LENGTH = 200;
const MAX_PLAYER_NAME_LENGTH = 200;
const MAX_EMOJI_LENGTH = 10;

/**
 * Log entry schema
 */
export const LogSchema = z.object({
	id: z.string().max(100),
	userId: z.string().uuid(),
	player: z.string().max(MAX_PLAYER_NAME_LENGTH).nullable(),
	emoji: z.string().max(MAX_EMOJI_LENGTH),
	line: z.string().max(MAX_STRING_LENGTH),
	timestamp: z.string().datetime(),
	original: z.string().max(MAX_LOG_CONTENT),
	open: z.boolean().optional().default(false),
	eventType: z.string().max(50).optional(),
	metadata: z.record(z.string(), z.any()).optional()
});

/**
 * Batch logs message schema (with optional compression)
 */
export const BatchLogsSchema = z.object({
	type: z.literal('batch_logs'),
	logs: z.array(LogSchema).optional(),
	compressed: z.boolean().optional(),
	compressedData: z.string().optional()
});

/**
 * Group log message schema
 */
export const GroupLogSchema = z.object({
	type: z.literal('group_log'),
	log: LogSchema,
	groupId: z.string().uuid(),
	senderId: z.string().uuid(),
	senderDisplayName: z.string().max(MAX_USERNAME_LENGTH)
});

/**
 * Batch group logs message schema (with optional compression)
 */
export const BatchGroupLogsSchema = z.object({
	type: z.literal('batch_group_logs'),
	logs: z.array(LogSchema).optional(),
	groupId: z.string().uuid(),
	senderId: z.string().uuid(),
	senderDisplayName: z.string().max(MAX_USERNAME_LENGTH),
	compressed: z.boolean().optional(),
	compressedData: z.string().optional()
});

/**
 * Single log message schema
 */
export const SingleLogSchema = z.object({
	type: z.literal('log'),
	log: LogSchema
});

/**
 * Sync logs message schema
 */
export const SyncLogsSchema = z.object({
	type: z.literal('sync_logs'),
	logs: z.array(LogSchema),
	senderId: z.string().uuid(),
	hasMore: z.boolean().optional(),
	total: z.number().int().nonnegative().optional(),
	offset: z.number().int().nonnegative().optional(),
	limit: z.number().int().positive().optional()
});

/**
 * User online/offline message schema
 */
export const UserPresenceSchema = z.object({
	type: z.enum(['user_online', 'user_offline']),
	userId: z.string().uuid()
});

/**
 * Auth complete message schema
 */
export const AuthCompleteSchema = z.object({
	type: z.enum(['auth_complete', 'desktop_auth_complete']),
	data: z.object({
		jwt: z.string().min(1),
		user: z.object({
			discordId: z.string(),
			username: z.string().max(MAX_USERNAME_LENGTH),
			avatar: z.string().nullable()
		})
	})
});

/**
 * Refetch message schemas
 */
export const RefetchSchema = z.object({
	type: z.enum(['refetch_friends', 'refetch_friend_requests', 'refetch_groups', 'refetch_group_invitations']),
});

/**
 * Refetch group details message schema
 */
export const RefetchGroupDetailsSchema = z.object({
	type: z.literal('refetch_group_details'),
	groupId: z.string().uuid()
});

/**
 * Error message schema
 */
export const ErrorMessageSchema = z.object({
	type: z.literal('error'),
	message: z.string().max(MAX_STRING_LENGTH)
});

/**
 * Registered message schema
 */
export const RegisteredSchema = z.object({
	type: z.literal('registered')
});

/**
 * Validate a WebSocket message against its schema
 * Returns validated data on success, null on failure
 */
export function validateMessage<T>(schema: z.ZodSchema<T>, message: any): T | null {
	try {
		return schema.parse(message);
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error('[Security] Message validation failed:', error.issues);
		}
		return null;
	}
}

/**
 * Type guards for validated messages
 */
export type ValidatedLog = z.infer<typeof LogSchema>;
export type ValidatedBatchLogs = z.infer<typeof BatchLogsSchema>;
export type ValidatedGroupLog = z.infer<typeof GroupLogSchema>;
export type ValidatedBatchGroupLogs = z.infer<typeof BatchGroupLogsSchema>;
export type ValidatedSingleLog = z.infer<typeof SingleLogSchema>;
export type ValidatedSyncLogs = z.infer<typeof SyncLogsSchema>;
export type ValidatedUserPresence = z.infer<typeof UserPresenceSchema>;
export type ValidatedAuthComplete = z.infer<typeof AuthCompleteSchema>;
export type ValidatedRefetch = z.infer<typeof RefetchSchema>;
export type ValidatedRefetchGroupDetails = z.infer<typeof RefetchGroupDetailsSchema>;
export type ValidatedError = z.infer<typeof ErrorMessageSchema>;
export type ValidatedRegistered = z.infer<typeof RegisteredSchema>;
