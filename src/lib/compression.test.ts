/**
 * Tests for compression utilities
 * Tests gzip compression/decompression using browser CompressionStream API
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { compressLogs, decompressLogs, shouldCompressLogs } from './compression';

describe('Compression Utilities', () => {
	// Mock data for testing
	const createMockLogs = (count: number) => {
		return Array.from({ length: count }, (_, i) => ({
			id: `log-${i}`,
			userId: '550e8400-e29b-41d4-a716-446655440000',
			player: `Player${i}`,
			emoji: '🛜',
			line: `Test log entry ${i} with some content to make it realistic`,
			timestamp: new Date().toISOString(),
			original: `<2024.01.01-12:00:00.000> Original log entry ${i} with additional context`,
		}));
	};

	describe('shouldCompressLogs', () => {
		it('should return false for small number of logs', () => {
			const logs = createMockLogs(5);
			const result = shouldCompressLogs(logs);

			expect(result).toBe(false);
		});

		it('should return true for logs exceeding count threshold', () => {
			const logs = createMockLogs(15); // > 10 logs
			const result = shouldCompressLogs(logs);

			expect(result).toBe(true);
		});

		it('should return true for logs exceeding size threshold', () => {
			// Create a large log that exceeds 5KB
			const largeLogs = [
				{
					id: 'log-large',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'Player',
					emoji: '🛜',
					line: 'x'.repeat(6000), // 6KB line
					timestamp: new Date().toISOString(),
					original: '<2024.01.01-12:00:00.000> Large log',
				},
			];

			const result = shouldCompressLogs(largeLogs);

			expect(result).toBe(true);
		});

		it('should return false for empty array', () => {
			const result = shouldCompressLogs([]);

			expect(result).toBe(false);
		});

		it('should handle edge case at exactly 10 logs', () => {
			const logs = createMockLogs(10);
			const result = shouldCompressLogs(logs);

			// Should be false at exactly 10 (> 10 is the threshold)
			expect(result).toBe(false);
		});

		it('should handle edge case at exactly 11 logs', () => {
			const logs = createMockLogs(11);
			const result = shouldCompressLogs(logs);

			// Should be true at 11 (> 10)
			expect(result).toBe(true);
		});
	});

	describe('compressLogs', () => {
		it('should compress logs to base64 string', async () => {
			const logs = createMockLogs(5);
			const compressed = await compressLogs(logs);

			// Should be a base64 string
			expect(typeof compressed).toBe('string');
			expect(compressed.length).toBeGreaterThan(0);

			// Base64 validation - should only contain valid base64 characters
			expect(compressed).toMatch(/^[A-Za-z0-9+/=]+$/);
		});

		it('should compress empty array', async () => {
			const compressed = await compressLogs([]);

			expect(typeof compressed).toBe('string');
			expect(compressed.length).toBeGreaterThan(0);
		});

		it('should produce smaller output for repetitive data', async () => {
			const repetitiveLogs = Array.from({ length: 20 }, (_, i) => ({
				id: `log-${i}`,
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'SamePlayer',
				emoji: '🛜',
				line: 'Same log line repeated',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Same original',
			}));

			const uncompressedSize = JSON.stringify(repetitiveLogs).length;
			const compressed = await compressLogs(repetitiveLogs);
			const compressedSize = compressed.length;

			// Compressed should be smaller than uncompressed for repetitive data
			expect(compressedSize).toBeLessThan(uncompressedSize);
		});

		it('should handle logs with special characters', async () => {
			const specialLogs = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'Player™©®',
					emoji: '🛜🚀💥',
					line: 'Test with émojis and spëcial çharacters 中文',
					timestamp: new Date().toISOString(),
					original: '<2024.01.01-12:00:00.000> Special chars: "\'<>&',
				},
			];

			const compressed = await compressLogs(specialLogs);

			expect(typeof compressed).toBe('string');
			expect(compressed.length).toBeGreaterThan(0);
		});

		it('should handle very large log arrays', async () => {
			const largeLogs = createMockLogs(1000);
			const compressed = await compressLogs(largeLogs);

			expect(typeof compressed).toBe('string');
			expect(compressed.length).toBeGreaterThan(0);
		});
	});

	describe('decompressLogs', () => {
		it('should decompress compressed logs correctly', async () => {
			const originalLogs = createMockLogs(5);
			const compressed = await compressLogs(originalLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(originalLogs);
		});

		it('should decompress empty array correctly', async () => {
			const originalLogs: any[] = [];
			const compressed = await compressLogs(originalLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual([]);
		});

		it('should preserve special characters after compression cycle', async () => {
			const specialLogs = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'Player™©®',
					emoji: '🛜🚀💥😵',
					line: 'Test with émojis and spëcial çharacters 中文 日本語',
					timestamp: new Date().toISOString(),
					original: '<2024.01.01-12:00:00.000> Special: "\'<>&',
				},
			];

			const compressed = await compressLogs(specialLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(specialLogs);
		});

		it('should preserve complex nested structures', async () => {
			const complexLogs = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'Player',
					emoji: '🛜',
					line: 'Test log',
					timestamp: new Date().toISOString(),
					original: '<2024.01.01-12:00:00.000> Log',
					eventType: 'actor_death',
					metadata: {
						victimName: 'Player1',
						victimId: '12345',
						zone: 'Stanton',
						killerName: 'Player2',
						killerId: '67890',
						weaponClass: 'Ballistic_Rifle',
						damageType: 'Ballistic',
						nested: {
							level1: {
								level2: {
									value: 'deep nested value',
								},
							},
						},
					},
				},
			];

			const compressed = await compressLogs(complexLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(complexLogs);
		});

		it('should decompress large arrays correctly', async () => {
			const largeLogs = createMockLogs(100);
			const compressed = await compressLogs(largeLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(largeLogs);
			expect(decompressed.length).toBe(100);
		});

		it('should throw error for invalid base64', async () => {
			await expect(decompressLogs('invalid-base64!!!')).rejects.toThrow();
		});

		it('should throw error for valid base64 but invalid gzip', async () => {
			// Valid base64 but not valid gzip data
			const invalidGzip = btoa('not gzipped data');

			await expect(decompressLogs(invalidGzip)).rejects.toThrow();
		});
	});

	describe('Compression Round-Trip', () => {
		it('should preserve data integrity through multiple compression cycles', async () => {
			const originalLogs = createMockLogs(10);

			// First cycle
			const compressed1 = await compressLogs(originalLogs);
			const decompressed1 = await decompressLogs(compressed1);

			// Second cycle (compress the already decompressed data)
			const compressed2 = await compressLogs(decompressed1);
			const decompressed2 = await decompressLogs(compressed2);

			expect(decompressed2).toEqual(originalLogs);
		});

		it('should handle all data types correctly', async () => {
			const mixedTypeLogs = [
				{
					stringField: 'text',
					numberField: 42,
					booleanField: true,
					nullField: null,
					arrayField: [1, 2, 3],
					objectField: { nested: 'value' },
					floatField: 3.14159,
					negativeField: -100,
				},
			];

			const compressed = await compressLogs(mixedTypeLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(mixedTypeLogs);
		});
	});

	describe('Performance and Edge Cases', () => {
		it('should handle single log efficiently', async () => {
			const singleLog = createMockLogs(1);
			const compressed = await compressLogs(singleLog);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(singleLog);
		});

		it('should handle logs with only required fields', async () => {
			const minimalLogs = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					emoji: '🛜',
					line: 'Minimal log',
					timestamp: new Date().toISOString(),
				},
			];

			const compressed = await compressLogs(minimalLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(minimalLogs);
		});

		it('should handle logs with null values', async () => {
			const logsWithNulls = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: null,
					emoji: '🛜',
					line: 'Log with nulls',
					timestamp: new Date().toISOString(),
					original: null,
					metadata: null,
				},
			];

			const compressed = await compressLogs(logsWithNulls);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(logsWithNulls);
		});

		it('should handle extremely long strings', async () => {
			const longStringLogs = [
				{
					id: 'log-1',
					userId: '550e8400-e29b-41d4-a716-446655440000',
					player: 'Player',
					emoji: '🛜',
					line: 'x'.repeat(10000),
					timestamp: new Date().toISOString(),
					original: 'y'.repeat(20000),
				},
			];

			const compressed = await compressLogs(longStringLogs);
			const decompressed = await decompressLogs(compressed);

			expect(decompressed).toEqual(longStringLogs);
		});
	});

	describe('Compression Ratio', () => {
		it('should achieve good compression for repetitive data', async () => {
			const repetitiveLogs = Array.from({ length: 100 }, () => ({
				id: 'same-id',
				userId: '550e8400-e29b-41d4-a716-446655440000',
				player: 'SamePlayer',
				emoji: '🛜',
				line: 'Repeated line',
				timestamp: '2024-01-01T12:00:00Z',
				original: '<2024.01.01-12:00:00.000> Same',
			}));

			const uncompressedSize = new Blob([JSON.stringify(repetitiveLogs)]).size;
			const compressed = await compressLogs(repetitiveLogs);
			const compressedSize = new Blob([compressed]).size;

			// Should achieve at least 50% compression for highly repetitive data
			expect(compressedSize).toBeLessThan(uncompressedSize * 0.5);
		});
	});
});
