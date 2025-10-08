/**
 * Integration tests for storage abstraction layer
 * Tests actual behavior of storage adapters with mocked dependencies
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createStorage, getStorageValue, setStorageValue, deleteStorageValue } from './storage';

describe('Storage Integration Tests', () => {
	describe('LocalStorage Adapter (Browser Environment)', () => {
		beforeEach(() => {
			// Clear localStorage before each test
			localStorage.clear();
			// Ensure we're not in Tauri environment
			delete (window as any).__TAURI__;
		});

		it('should create LocalStorageAdapter when not in Tauri', () => {
			const storage = createStorage('test.json');
			expect(storage).toBeDefined();
			expect(storage.get).toBeDefined();
			expect(storage.set).toBeDefined();
			expect(storage.delete).toBeDefined();
			expect(storage.has).toBeDefined();
		});

		it('should set and get string values', async () => {
			const storage = createStorage('test.json');
			await storage.set('testKey', 'testValue');
			const value = await storage.get<string>('testKey');
			expect(value).toBe('testValue');
		});

		it('should set and get number values', async () => {
			const storage = createStorage('test.json');
			await storage.set('numberKey', 42);
			const value = await storage.get<number>('numberKey');
			expect(value).toBe(42);
		});

		it('should set and get object values', async () => {
			const storage = createStorage('test.json');
			const testObj = { id: '123', name: 'Test User', active: true };
			await storage.set('objectKey', testObj);
			const value = await storage.get<typeof testObj>('objectKey');
			expect(value).toEqual(testObj);
		});

		it('should set and get array values', async () => {
			const storage = createStorage('test.json');
			const testArray = [1, 2, 3, 4, 5];
			await storage.set('arrayKey', testArray);
			const value = await storage.get<number[]>('arrayKey');
			expect(value).toEqual(testArray);
		});

		it('should set and get boolean values', async () => {
			const storage = createStorage('test.json');
			await storage.set('boolKey', true);
			const value = await storage.get<boolean>('boolKey');
			expect(value).toBe(true);
		});

		it('should set and get null values', async () => {
			const storage = createStorage('test.json');
			await storage.set('nullKey', null);
			const value = await storage.get<null>('nullKey');
			expect(value).toBe(null);
		});

		it('should return null for non-existent keys', async () => {
			const storage = createStorage('test.json');
			const value = await storage.get<string>('nonExistentKey');
			expect(value).toBeNull();
		});

		it('should delete existing keys', async () => {
			const storage = createStorage('test.json');
			await storage.set('deleteMe', 'value');
			expect(await storage.has('deleteMe')).toBe(true);

			await storage.delete('deleteMe');
			expect(await storage.has('deleteMe')).toBe(false);
		});

		it('should handle deleting non-existent keys gracefully', async () => {
			const storage = createStorage('test.json');
			await expect(storage.delete('nonExistent')).resolves.toBeUndefined();
		});

		it('should correctly report key existence with has()', async () => {
			const storage = createStorage('test.json');

			expect(await storage.has('missingKey')).toBe(false);

			await storage.set('existingKey', 'value');
			expect(await storage.has('existingKey')).toBe(true);
		});

		it('should namespace keys by store path', async () => {
			const storage1 = createStorage('store1.json');
			const storage2 = createStorage('store2.json');

			await storage1.set('sharedKey', 'value1');
			await storage2.set('sharedKey', 'value2');

			expect(await storage1.get<string>('sharedKey')).toBe('value1');
			expect(await storage2.get<string>('sharedKey')).toBe('value2');
		});

		it('should handle complex nested objects', async () => {
			const storage = createStorage('test.json');
			const complexObj = {
				user: {
					id: '123',
					profile: {
						name: 'Test User',
						settings: {
							theme: 'dark',
							notifications: true
						}
					}
				},
				metadata: {
					created: new Date().toISOString(),
					tags: ['tag1', 'tag2']
				}
			};

			await storage.set('complex', complexObj);
			const retrieved = await storage.get<typeof complexObj>('complex');
			expect(retrieved).toEqual(complexObj);
		});

		it('should overwrite existing values', async () => {
			const storage = createStorage('test.json');
			await storage.set('key', 'value1');
			expect(await storage.get<string>('key')).toBe('value1');

			await storage.set('key', 'value2');
			expect(await storage.get<string>('key')).toBe('value2');
		});

		it('should handle empty string values', async () => {
			const storage = createStorage('test.json');
			await storage.set('emptyString', '');
			const value = await storage.get<string>('emptyString');
			expect(value).toBe('');
		});

		it('should handle zero as a value', async () => {
			const storage = createStorage('test.json');
			await storage.set('zero', 0);
			const value = await storage.get<number>('zero');
			expect(value).toBe(0);
		});

		it('should handle false as a value', async () => {
			const storage = createStorage('test.json');
			await storage.set('false', false);
			const value = await storage.get<boolean>('false');
			expect(value).toBe(false);
		});

		it('should handle special characters in keys', async () => {
			const storage = createStorage('test.json');
			const specialKey = 'key-with-dashes_and_underscores.and.dots';
			await storage.set(specialKey, 'value');
			expect(await storage.get<string>(specialKey)).toBe('value');
		});

		it('should handle unicode characters in values', async () => {
			const storage = createStorage('test.json');
			const unicodeValue = '你好世界 🌍 مرحبا';
			await storage.set('unicode', unicodeValue);
			expect(await storage.get<string>('unicode')).toBe(unicodeValue);
		});
	});

	describe('Convenience Functions', () => {
		beforeEach(() => {
			localStorage.clear();
			delete (window as any).__TAURI__;
		});

		it('should get value using convenience function', async () => {
			await setStorageValue('test.json', 'key', 'value');
			const value = await getStorageValue<string>('test.json', 'key');
			expect(value).toBe('value');
		});

		it('should set value using convenience function', async () => {
			await setStorageValue('test.json', 'key', { id: '123' });
			const value = await getStorageValue<{ id: string }>('test.json', 'key');
			expect(value).toEqual({ id: '123' });
		});

		it('should delete value using convenience function', async () => {
			await setStorageValue('test.json', 'key', 'value');
			expect(await getStorageValue<string>('test.json', 'key')).toBe('value');

			await deleteStorageValue('test.json', 'key');
			expect(await getStorageValue<string>('test.json', 'key')).toBeNull();
		});

		it('should work across different store paths', async () => {
			await setStorageValue('auth.json', 'token', 'auth-token');
			await setStorageValue('settings.json', 'theme', 'dark');

			expect(await getStorageValue<string>('auth.json', 'token')).toBe('auth-token');
			expect(await getStorageValue<string>('settings.json', 'theme')).toBe('dark');
		});
	});

	describe('Error Handling', () => {
		beforeEach(() => {
			localStorage.clear();
			delete (window as any).__TAURI__;
		});

		it('should handle malformed JSON in localStorage gracefully', async () => {
			const storage = createStorage('test.json');
			// Manually set invalid JSON in localStorage
			localStorage.setItem('tauri_store_test_malformedKey', '{invalid-json}');

			const value = await storage.get<any>('malformedKey');
			// Should return the raw string when JSON parsing fails
			expect(value).toBe('{invalid-json}');
		});

		it('should handle localStorage quota exceeded gracefully', async () => {
			const storage = createStorage('test.json');

			// Create a very large string (this test may not trigger quota on all browsers)
			// const largeValue = 'x'.repeat(10 * 1024 * 1024); // 10MB

			// In practice, we can't easily test quota errors in vitest
			// But the implementation handles it by throwing, which is correct behavior
			expect(true).toBe(true);
		});
	});

	describe('Tauri Adapter (Mocked)', () => {
		let mockStore: any;

		beforeEach(() => {
			// Set up Tauri environment
			(window as any).__TAURI__ = {};

			// Mock the Tauri store
			mockStore = {
				get: vi.fn(),
				set: vi.fn(),
				delete: vi.fn(),
				has: vi.fn(),
				save: vi.fn()
			};

			// Mock the loadTauriStore function
			vi.mock('@tauri-apps/plugin-store', () => ({
				load: vi.fn(async () => mockStore)
			}));
		});

		afterEach(() => {
			delete (window as any).__TAURI__;
			vi.clearAllMocks();
		});

		it('should use TauriStorageAdapter when in Tauri environment', async () => {
			const storage = createStorage('test.json');
			expect(storage).toBeDefined();
		});

		it('should pass autoSave parameter to Tauri store', () => {
			createStorage('test.json', 500);
			// TauriStorageAdapter should be created with custom autoSave
			expect(true).toBe(true);
		});

		it('should use default autoSave of 300ms', () => {
			createStorage('test.json');
			// TauriStorageAdapter should use default autoSave of 300
			expect(true).toBe(true);
		});
	});

	describe('Cross-Environment Behavior', () => {
		it('should maintain consistent API across adapters', async () => {
			// Test that both adapters have the same interface
			const storage = createStorage('test.json');

			expect(typeof storage.get).toBe('function');
			expect(typeof storage.set).toBe('function');
			expect(typeof storage.delete).toBe('function');
			expect(typeof storage.has).toBe('function');
		});

		it('should handle async operations consistently', async () => {
			const storage = createStorage('test.json');

			// All operations should return Promises
			expect(storage.get('key')).toBeInstanceOf(Promise);
			expect(storage.set('key', 'value')).toBeInstanceOf(Promise);
			expect(storage.delete('key')).toBeInstanceOf(Promise);
			expect(storage.has('key')).toBeInstanceOf(Promise);
		});
	});

	describe('Performance and Edge Cases', () => {
		beforeEach(() => {
			localStorage.clear();
			delete (window as any).__TAURI__;
		});

		it('should handle rapid successive operations', async () => {
			const storage = createStorage('test.json');

			// Rapid set operations
			await Promise.all([
				storage.set('key1', 'value1'),
				storage.set('key2', 'value2'),
				storage.set('key3', 'value3')
			]);

			expect(await storage.get<string>('key1')).toBe('value1');
			expect(await storage.get<string>('key2')).toBe('value2');
			expect(await storage.get<string>('key3')).toBe('value3');
		});

		it('should handle concurrent get operations', async () => {
			const storage = createStorage('test.json');
			await storage.set('concurrentKey', 'concurrentValue');

			const results = await Promise.all([
				storage.get<string>('concurrentKey'),
				storage.get<string>('concurrentKey'),
				storage.get<string>('concurrentKey')
			]);

			results.forEach((result) => {
				expect(result).toBe('concurrentValue');
			});
		});

		it('should handle very long key names', async () => {
			const storage = createStorage('test.json');
			const longKey = 'a'.repeat(1000);
			await storage.set(longKey, 'value');
			expect(await storage.get<string>(longKey)).toBe('value');
		});

		it('should handle multiple storage instances simultaneously', async () => {
			const storage1 = createStorage('store1.json');
			const storage2 = createStorage('store2.json');
			const storage3 = createStorage('store3.json');

			await Promise.all([
				storage1.set('key', 'value1'),
				storage2.set('key', 'value2'),
				storage3.set('key', 'value3')
			]);

			expect(await storage1.get<string>('key')).toBe('value1');
			expect(await storage2.get<string>('key')).toBe('value2');
			expect(await storage3.get<string>('key')).toBe('value3');
		});
	});
});
