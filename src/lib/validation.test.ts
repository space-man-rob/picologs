/**
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
	LogSchema,
	BatchLogsSchema,
	GroupLogSchema,
	BatchGroupLogsSchema,
	SingleLogSchema,
	SyncLogsSchema,
	UserPresenceSchema,
	AuthCompleteSchema,
	RefetchSchema,
	RefetchGroupDetailsSchema,
	ErrorMessageSchema,
	RegisteredSchema,
	validateMessage,
} from './validation';

describe('Validation Schemas', () => {
	describe('LogSchema', () => {
		it('should validate correct log entry', () => {
			const validLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
				open: false,
			};

			const result = LogSchema.safeParse(validLog);
			expect(result.success).toBe(true);
		});

		it('should allow null player', () => {
			const validLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: null,
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
			};

			const result = LogSchema.safeParse(validLog);
			expect(result.success).toBe(true);
		});

		it('should reject invalid UUID for userId', () => {
			const invalidLog = {
				id: 'log-123',
				userId: 'not-a-uuid',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
			};

			const result = LogSchema.safeParse(invalidLog);
			expect(result.success).toBe(false);
		});

		it('should reject strings exceeding max length', () => {
			const invalidLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'x'.repeat(1001), // Exceeds MAX_STRING_LENGTH
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
			};

			const result = LogSchema.safeParse(invalidLog);
			expect(result.success).toBe(false);
		});

		it('should accept optional eventType and metadata', () => {
			const validLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
				eventType: 'actor_death',
				metadata: { victimName: 'Player1', killerId: '12345' },
			};

			const result = LogSchema.safeParse(validLog);
			expect(result.success).toBe(true);
		});

		it('should default open to false when not provided', () => {
			const validLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test log entry',
			};

			const result = LogSchema.safeParse(validLog);
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.open).toBe(false);
			}
		});
	});

	describe('BatchLogsSchema', () => {
		it('should validate batch logs message', () => {
			const validMessage = {
				type: 'batch_logs',
				logs: [
					{
						id: 'log-123',
						userId: '550e8400-e29b-41d4-a716-446655440000',
						player: 'TestPlayer',
						emoji: '🛜',
						line: 'Test log entry',
						timestamp: '2024-01-01T12:00:00Z',
						original: '<2024.01.01-12:00:00.000> Test log entry',
					},
				],
			};

			const result = BatchLogsSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should accept compressed data', () => {
			const validMessage = {
				type: 'batch_logs',
				compressed: true,
				compressedData: 'base64-compressed-data',
			};

			const result = BatchLogsSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject incorrect type literal', () => {
			const invalidMessage = {
				type: 'wrong_type',
				logs: [],
			};

			const result = BatchLogsSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('GroupLogSchema', () => {
		it('should validate group log message', () => {
			const validMessage = {
				type: 'group_log',
				log: {
					id: 'log-123',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'TestPlayer',
					emoji: '🛜',
					line: 'Test log entry',
					timestamp: '2024-01-01T12:00:00Z',
					original: '<2024.01.01-12:00:00.000> Test log entry',
				},
				groupId: '550e8400-e29b-41d4-a716-446655440000',
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				senderDisplayName: 'SenderUser',
			};

			const result = GroupLogSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject non-UUID groupId', () => {
			const invalidMessage = {
				type: 'group_log',
				log: {
					id: 'log-123',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'TestPlayer',
					emoji: '🛜',
					line: 'Test log entry',
					timestamp: '2024-01-01T12:00:00Z',
					original: '<2024.01.01-12:00:00.000> Test log entry',
				},
				groupId: 'not-a-uuid',
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				senderDisplayName: 'SenderUser',
			};

			const result = GroupLogSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('SyncLogsSchema', () => {
		it('should validate sync logs message', () => {
			const validMessage = {
				type: 'sync_logs',
				logs: [],
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				hasMore: true,
				total: 100,
				offset: 0,
				limit: 50,
			};

			const result = SyncLogsSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject negative offset', () => {
			const invalidMessage = {
				type: 'sync_logs',
				logs: [],
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				offset: -1,
			};

			const result = SyncLogsSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});

		it('should reject non-positive limit', () => {
			const invalidMessage = {
				type: 'sync_logs',
				logs: [],
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				limit: 0,
			};

			const result = SyncLogsSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('UserPresenceSchema', () => {
		it('should validate user_online message', () => {
			const validMessage = {
				type: 'user_online',
				userId: '550e8400-e29b-41d4-a716-446655440000',
			};

			const result = UserPresenceSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should validate user_offline message', () => {
			const validMessage = {
				type: 'user_offline',
				userId: '550e8400-e29b-41d4-a716-446655440000',
			};

			const result = UserPresenceSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject invalid presence type', () => {
			const invalidMessage = {
				type: 'user_away',
				userId: '550e8400-e29b-41d4-a716-446655440000',
			};

			const result = UserPresenceSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('AuthCompleteSchema', () => {
		it('should validate auth_complete message', () => {
			const validMessage = {
				type: 'auth_complete',
				data: {
					jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
					user: {
						discordId: '123456789',
						username: 'TestUser',
						avatar: 'avatar-hash',
					},
				},
			};

			const result = AuthCompleteSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should validate desktop_auth_complete message', () => {
			const validMessage = {
				type: 'desktop_auth_complete',
				data: {
					jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
					user: {
						discordId: '123456789',
						username: 'TestUser',
						avatar: null,
					},
				},
			};

			const result = AuthCompleteSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject empty JWT', () => {
			const invalidMessage = {
				type: 'auth_complete',
				data: {
					jwt: '',
					user: {
						discordId: '123456789',
						username: 'TestUser',
						avatar: null,
					},
				},
			};

			const result = AuthCompleteSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});

		it('should enforce max username length', () => {
			const invalidMessage = {
				type: 'auth_complete',
				data: {
					jwt: 'valid-jwt',
					user: {
						discordId: '123456789',
						username: 'x'.repeat(201), // Exceeds MAX_USERNAME_LENGTH
						avatar: null,
					},
				},
			};

			const result = AuthCompleteSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('RefetchSchema', () => {
		it('should validate refetch_friends message', () => {
			const validMessage = { type: 'refetch_friends' };
			const result = RefetchSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should validate refetch_friend_requests message', () => {
			const validMessage = { type: 'refetch_friend_requests' };
			const result = RefetchSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should validate refetch_groups message', () => {
			const validMessage = { type: 'refetch_groups' };
			const result = RefetchSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should validate refetch_group_invitations message', () => {
			const validMessage = { type: 'refetch_group_invitations' };
			const result = RefetchSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});
	});

	describe('RefetchGroupDetailsSchema', () => {
		it('should validate refetch_group_details message', () => {
			const validMessage = {
				type: 'refetch_group_details',
				groupId: '550e8400-e29b-41d4-a716-446655440000',
			};

			const result = RefetchGroupDetailsSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should reject non-UUID groupId', () => {
			const invalidMessage = {
				type: 'refetch_group_details',
				groupId: 'not-a-uuid',
			};

			const result = RefetchGroupDetailsSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('ErrorMessageSchema', () => {
		it('should validate error message', () => {
			const validMessage = {
				type: 'error',
				message: 'Something went wrong',
			};

			const result = ErrorMessageSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});

		it('should enforce max message length', () => {
			const invalidMessage = {
				type: 'error',
				message: 'x'.repeat(1001),
			};

			const result = ErrorMessageSchema.safeParse(invalidMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('RegisteredSchema', () => {
		it('should validate registered message', () => {
			const validMessage = { type: 'registered' };
			const result = RegisteredSchema.safeParse(validMessage);
			expect(result.success).toBe(true);
		});
	});

	describe('validateMessage helper', () => {
		it('should return validated data on success', () => {
			const message = {
				type: 'registered',
			};

			const result = validateMessage(RegisteredSchema, message);
			expect(result).toEqual(message);
		});

		it('should return null on validation failure', () => {
			const message = {
				type: 'invalid',
			};

			const result = validateMessage(RegisteredSchema, message);
			expect(result).toBeNull();
		});

		it('should log validation errors', async () => {
			const { vi } = await import('vitest');
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

			const message = {
				type: 'invalid',
			};

			validateMessage(RegisteredSchema, message);

			expect(consoleError).toHaveBeenCalled();
			consoleError.mockRestore();
		});
	});

	describe('Security - DoS Prevention', () => {
		it('should reject extremely long strings in log lines', () => {
			const attackLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'x'.repeat(1001), // Exceeds limit
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test',
			};

			const result = LogSchema.safeParse(attackLog);
			expect(result.success).toBe(false);
		});

		it('should reject extremely long original log content', () => {
			const attackLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test',
				timestamp: '2024-01-01T12:00:00Z',
				original: 'x'.repeat(2001), // Exceeds MAX_LOG_CONTENT
			};

			const result = LogSchema.safeParse(attackLog);
			expect(result.success).toBe(false);
		});

		it('should reject extremely long player names', () => {
			const attackLog = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'x'.repeat(201), // Exceeds MAX_PLAYER_NAME_LENGTH
				emoji: '🛜',
				line: 'Test',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test',
			};

			const result = LogSchema.safeParse(attackLog);
			expect(result.success).toBe(false);
		});

		it('should reject extremely long usernames in group logs', () => {
			const attackMessage = {
				type: 'group_log',
				log: {
					id: 'log-123',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'TestPlayer',
					emoji: '🛜',
					line: 'Test',
					timestamp: '2024-01-01T12:00:00Z',
					original: '<2024.01.01-12:00:00.000> Test',
				},
				groupId: '550e8400-e29b-41d4-a716-446655440000',
				senderId: '550e8400-e29b-41d4-a716-446655440000',
				senderUsername: 'x'.repeat(201), // Exceeds MAX_USERNAME_LENGTH
			};

			const result = GroupLogSchema.safeParse(attackMessage);
			expect(result.success).toBe(false);
		});
	});

	describe('Type Inference', () => {
		it('should correctly infer ValidatedLog type', () => {
			const message = {
				id: 'log-123',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'TestPlayer',
				emoji: '🛜',
				line: 'Test',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Test',
			};

			const result = validateMessage(LogSchema, message);

			if (result) {
				// TypeScript should infer correct type
				expect(result.id).toBe('log-123');
				expect(result.userId).toBe('550e8400-e29b-41d4-a716-446655440000');
			}
		});
	});
});
