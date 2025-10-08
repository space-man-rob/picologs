/**
 * Tests using Tauri's official mocking API
 * https://v2.tauri.app/develop/tests/mocking/
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { invoke } from '@tauri-apps/api/core';

describe('Tauri IPC Mocking', () => {
	afterEach(() => {
		// Clear mocks after each test
		clearMocks();
	});

	it('should mock the greet command', async () => {
		// Mock the IPC to intercept Tauri commands
		mockIPC((cmd, args) => {
			if (cmd === 'greet') {
				return `Hello, ${args.name}! You've been greeted from Rust!`;
			}
		});

		// Invoke the command and verify the response
		const result = await invoke<string>('greet', { name: 'Vitest' });
		expect(result).toBe("Hello, Vitest! You've been greeted from Rust!");
	});

	it('should handle different arguments', async () => {
		mockIPC((cmd, args) => {
			if (cmd === 'greet') {
				return `Hello, ${args.name}! You've been greeted from Rust!`;
			}
		});

		const result = await invoke<string>('greet', { name: 'Picologs' });
		expect(result).toBe("Hello, Picologs! You've been greeted from Rust!");
	});

	it('should work with multiple command types', async () => {
		mockIPC((cmd, args) => {
			if (cmd === 'greet') {
				return `Hello, ${args.name}! You've been greeted from Rust!`;
			}
			if (cmd === 'add') {
				return (args.a as number) + (args.b as number);
			}
		});

		const greeting = await invoke<string>('greet', { name: 'Test' });
		expect(greeting).toBe("Hello, Test! You've been greeted from Rust!");

		const sum = await invoke<number>('add', { a: 5, b: 3 });
		expect(sum).toBe(8);
	});
});
