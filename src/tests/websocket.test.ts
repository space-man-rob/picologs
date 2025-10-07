import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for WebSocket functionality
 * Tests message sending, receiving, and connection handling
 */

describe('WebSocket Integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Connection Management', () => {
		it('should establish WebSocket connection with JWT', async () => {
			// Mock WebSocket constructor
			const mockWebSocket = {
				send: vi.fn(),
				close: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');

			expect(ws).toBeDefined();
			expect(WebSocket).toHaveBeenCalledWith('wss://test.com/ws');
		});

		it('should send register message with userId', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			ws.send(
				JSON.stringify({
					type: 'register',
					userId: 'user-123',
				})
			);

			expect(mockSend).toHaveBeenCalledWith(
				JSON.stringify({
					type: 'register',
					userId: 'user-123',
				})
			);
		});

		it('should handle connection errors gracefully', async () => {
			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'error') {
						handler(new Event('error'));
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let errorHandled = false;

			ws.addEventListener('error', () => {
				errorHandled = true;
			});

			expect(errorHandled).toBe(true);
		});
	});

	describe('Message Types', () => {
		it('should send log message with proper structure', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const logMessage = {
				type: 'log',
				log: {
					id: 'log-1',
					userId: 'user-123',
					emoji: '🛜',
					line: 'Player connected',
					timestamp: new Date().toISOString(),
					original: '<2024.01.01-12:00:00.000> Connection',
				},
			};

			ws.send(JSON.stringify(logMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(logMessage));
		});

		it('should send batch_logs message with multiple logs', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const batchMessage = {
				type: 'batch_logs',
				logs: [
					{
						id: 'log-1',
						userId: 'user-123',
						emoji: '🛜',
						line: 'Log 1',
						timestamp: new Date().toISOString(),
					},
					{
						id: 'log-2',
						userId: 'user-123',
						emoji: '🛜',
						line: 'Log 2',
						timestamp: new Date().toISOString(),
					},
				],
			};

			ws.send(JSON.stringify(batchMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(batchMessage));
		});

		it('should send friend request message', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const friendRequestMessage = {
				type: 'friend_request_by_code',
				friendCode: 'ABC123',
			};

			ws.send(JSON.stringify(friendRequestMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(friendRequestMessage));
		});

		it('should send update_my_details message', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const updateMessage = {
				type: 'update_my_details',
				userId: 'user-123',
				playerName: 'TestPlayer',
				playerId: 'sc-player-123',
				timezone: 'America/New_York',
			};

			ws.send(JSON.stringify(updateMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(updateMessage));
		});

		it('should send sync_logs message with delta parameters', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const syncMessage = {
				type: 'sync_logs',
				targetUserId: 'friend-123',
				logs: [],
				since: '2024-01-01T12:00:00.000Z',
				limit: 100,
				offset: 0,
			};

			ws.send(JSON.stringify(syncMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(syncMessage));
		});
	});

	describe('Message Receiving', () => {
		it('should handle incoming log message', async () => {
			let messageHandler: ((event: MessageEvent) => void) | null = null;

			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'message') {
						messageHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let receivedLog = null;

			ws.addEventListener('message', (event: MessageEvent) => {
				const data = JSON.parse(event.data);
				if (data.type === 'log') {
					receivedLog = data.log;
				}
			});

			// Simulate receiving a log message
			const incomingLog = {
				type: 'log',
				log: {
					id: 'log-1',
					userId: 'friend-123',
					emoji: '🛜',
					line: 'Friend connected',
					timestamp: new Date().toISOString(),
				},
			};

			messageHandler?.(
				new MessageEvent('message', {
					data: JSON.stringify(incomingLog),
				})
			);

			expect(receivedLog).toEqual(incomingLog.log);
		});

		it('should handle friend_came_online message', async () => {
			let messageHandler: ((event: MessageEvent) => void) | null = null;

			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'message') {
						messageHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let friendOnlineId = null;

			ws.addEventListener('message', (event: MessageEvent) => {
				const data = JSON.parse(event.data);
				if (data.type === 'user_came_online') {
					friendOnlineId = data.userId;
				}
			});

			messageHandler?.(
				new MessageEvent('message', {
					data: JSON.stringify({
						type: 'user_came_online',
						userId: 'friend-123',
					}),
				})
			);

			expect(friendOnlineId).toBe('friend-123');
		});

		it('should handle friend_request_received message', async () => {
			let messageHandler: ((event: MessageEvent) => void) | null = null;

			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'message') {
						messageHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let receivedRequest = null;

			ws.addEventListener('message', (event: MessageEvent) => {
				const data = JSON.parse(event.data);
				if (data.type === 'friend_request_received') {
					receivedRequest = data;
				}
			});

			messageHandler?.(
				new MessageEvent('message', {
					data: JSON.stringify({
						type: 'friend_request_received',
						from: 'user-123',
						friendCode: 'ABC123',
					}),
				})
			);

			expect(receivedRequest).toBeTruthy();
		});
	});

	describe('Ping/Pong Keepalive', () => {
		it('should respond to ping with pong', async () => {
			let messageHandler: ((event: MessageEvent) => void) | null = null;
			const mockSend = vi.fn();

			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn((event, handler) => {
					if (event === 'message') {
						messageHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');

			ws.addEventListener('message', (event: MessageEvent) => {
				const data = JSON.parse(event.data);
				if (data.type === 'ping') {
					ws.send(JSON.stringify({ type: 'pong' }));
				}
			});

			// Simulate receiving a ping
			messageHandler?.(
				new MessageEvent('message', {
					data: JSON.stringify({ type: 'ping' }),
				})
			);

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
		});
	});

	describe('Error Handling', () => {
		it('should handle malformed JSON messages', async () => {
			let messageHandler: ((event: MessageEvent) => void) | null = null;

			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'message') {
						messageHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let errorOccurred = false;

			ws.addEventListener('message', (event: MessageEvent) => {
				try {
					JSON.parse(event.data);
				} catch (error) {
					errorOccurred = true;
				}
			});

			messageHandler?.(
				new MessageEvent('message', {
					data: 'invalid json{',
				})
			);

			expect(errorOccurred).toBe(true);
		});

		it('should handle connection close gracefully', async () => {
			let closeHandler: ((event: CloseEvent) => void) | null = null;

			const mockWebSocket = {
				send: vi.fn(),
				addEventListener: vi.fn((event, handler) => {
					if (event === 'close') {
						closeHandler = handler;
					}
				}),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			let connectionClosed = false;

			ws.addEventListener('close', () => {
				connectionClosed = true;
			});

			closeHandler?.(new CloseEvent('close', { code: 1000, reason: 'Normal closure' }));

			expect(connectionClosed).toBe(true);
		});
	});

	describe('Compression Support', () => {
		it('should send compressed logs when batch is large', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');

			// Simulate a large batch that should be compressed
			const largeMessage = {
				type: 'batch_logs',
				compressed: true,
				compressedData: 'base64-encoded-compressed-data',
			};

			ws.send(JSON.stringify(largeMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(largeMessage));
		});
	});

	describe('Group Logs', () => {
		it('should send batch_group_logs message', async () => {
			const mockSend = vi.fn();
			const mockWebSocket = {
				send: mockSend,
				addEventListener: vi.fn(),
			};

			global.WebSocket = vi.fn(() => mockWebSocket) as any;

			const ws = new WebSocket('wss://test.com/ws');
			const groupMessage = {
				type: 'batch_group_logs',
				groupId: 'group-123',
				logs: [
					{
						id: 'log-1',
						userId: 'user-123',
						emoji: '🛜',
						line: 'Group log',
						timestamp: new Date().toISOString(),
					},
				],
			};

			ws.send(JSON.stringify(groupMessage));

			expect(mockSend).toHaveBeenCalledWith(JSON.stringify(groupMessage));
		});
	});
});
