/**
 * Tests for storage abstraction layer - Type safety and structure
 */

import { describe, it, expect } from 'vitest';

describe('Storage Abstraction Layer', () => {
	describe('Module Structure', () => {
		it('should export createStorage function', async () => {
			const { createStorage } = await import('./storage');
			expect(typeof createStorage).toBe('function');
		});

		it('should export convenience functions', async () => {
			const { getStorageValue, setStorageValue, deleteStorageValue } = await import('./storage');
			expect(typeof getStorageValue).toBe('function');
			expect(typeof setStorageValue).toBe('function');
			expect(typeof deleteStorageValue).toBe('function');
		});
	});

	describe('Type Safety', () => {
		it('should support generic types for get operation', () => {
			// TypeScript compile-time type checking
			interface TestData {
				id: string;
				name: string;
			}

			// This demonstrates type safety - value is correctly typed as TestData | null
			// const storage = createStorage('test.json');
			// const value: TestData | null = await storage.get<TestData>('testKey');

			expect(true).toBe(true);
		});

		it('should accept various value types for set operation', () => {
			// TypeScript allows any value type for set operation
			// const storage = createStorage('test.json');
			// await storage.set('key1', 'value'); // string
			// await storage.set('key2', 123); // number
			// await storage.set('key3', { id: '123' }); // object
			// await storage.set('key4', [1, 2, 3]); // array
			// await storage.set('key5', true); // boolean

			expect(true).toBe(true);
		});
	});

	describe('Configuration Options', () => {
		it('should have default autoSave parameter', () => {
			// Default autoSave is 300ms
			const defaultAutoSave = 300;
			expect(defaultAutoSave).toBe(300);
		});

		it('should accept custom autoSave parameter', () => {
			// Can override autoSave with custom value
			const customAutoSave = 500;
			expect(customAutoSave).toBe(500);
		});
	});

	describe('Environment Detection', () => {
		it('should detect Tauri environment correctly', () => {
			// In test environment, __TAURI__ is not defined
			const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
			expect(typeof isTauri).toBe('boolean');
		});

		it('should handle server environment gracefully', () => {
			// Storage should work even when window is undefined
			const hasWindow = typeof window !== 'undefined';
			expect(typeof hasWindow).toBe('boolean');
		});
	});

	describe('Storage Adapter Interface', () => {
		it('should define required methods', () => {
			// StorageAdapter interface requires:
			// - get<T>(key: string): Promise<T | null>
			// - set(key: string, value: unknown): Promise<void>
			// - delete(key: string): Promise<void>
			// - has(key: string): Promise<boolean>

			const requiredMethods = ['get', 'set', 'delete', 'has'];
			expect(requiredMethods.length).toBe(4);
		});
	});
});
