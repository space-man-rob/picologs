/**
 * Vitest Browser Mode setup file for Picologs component tests
 * Mocks Tauri APIs for browser environment
 */

import { vi } from 'vitest';

// Mock Tauri API modules for browser environment
vi.mock('@tauri-apps/api/path', () => ({
	appDataDir: vi.fn(async () => '/mock/app/data/'),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
	readTextFile: vi.fn(async (path: string) => {
		return ''; // Default empty file
	}),
	writeFile: vi.fn(async (path: string, data: Uint8Array) => {
		// Mock successful write
	}),
	watchImmediate: vi.fn(async (path: string, callback: Function, options?: any) => {
		// Return a cleanup function
		return () => {};
	}),
}));

vi.mock('@tauri-apps/plugin-store', () => ({
	load: vi.fn(async (filename: string, options?: any) => {
		const store = new Map<string, any>();
		return {
			get: vi.fn(async (key: string) => store.get(key)),
			set: vi.fn(async (key: string, value: any) => {
				store.set(key, value);
			}),
			save: vi.fn(async () => {}),
			delete: vi.fn(async (key: string) => {
				store.delete(key);
			}),
			clear: vi.fn(async () => {
				store.clear();
			}),
		};
	}),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
	open: vi.fn(async (options?: any) => {
		// Return mock file path
		return 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log';
	}),
	ask: vi.fn(async () => true),
}));

vi.mock('@tauri-apps/plugin-websocket', () => ({
	WebSocket: vi.fn(() => ({
		send: vi.fn(async (message: string) => {}),
		addListener: vi.fn((event: string, callback: Function) => {
			return () => {}; // Return unsubscribe function
		}),
	})),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
	open: vi.fn(async (url: string) => {}),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
	exit: vi.fn((code?: number) => {}),
	relaunch: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
	check: vi.fn(async () => null),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
	fetch: vi.fn(async (url: string, options?: any) => ({
		ok: true,
		status: 200,
		json: async () => ({}),
		text: async () => '',
	})),
}));

// Global test utilities for component tests
export const createMockLog = (overrides?: Partial<any>) => ({
	id: 'test-log-1',
	userId: 'user-123',
	player: 'TestPlayer',
	emoji: '🛜',
	line: 'Test log entry',
	timestamp: new Date().toISOString(),
	original: '<2024.01.01-12:00:00.000> Test log entry',
	open: false,
	...overrides,
});

export const createMockFriend = (overrides?: Partial<any>) => ({
	id: 'friend-123',
	discordId: 'discord-123',
	friendCode: 'ABC123',
	name: 'TestFriend',
	avatar: null,
	status: 'confirmed' as const,
	timezone: 'America/New_York',
	isOnline: true,
	isConnected: true,
	...overrides,
});
