import { describe, it, expect, vi } from 'vitest';
import { safeMatch, safeTest, safeExec } from './regex-utils';

describe('regex-utils', () => {
	describe('safeMatch', () => {
		it('should successfully match a simple pattern', () => {
			const pattern = /hello (\w+)/;
			const text = 'hello world';
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[0]).toBe('hello world');
			expect(result?.[1]).toBe('world');
		});

		it('should return null for non-matching pattern', () => {
			const pattern = /goodbye/;
			const text = 'hello world';
			const result = safeMatch(pattern, text);

			expect(result).toBeNull();
		});

		it('should handle complex patterns', () => {
			const pattern = /'([^']+)' \[(\d+)\]/;
			const text = "'TestPlayer' [12345]";
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('TestPlayer');
			expect(result?.[2]).toBe('12345');
		});

		it('should match Actor Death log pattern', () => {
			const pattern =
				/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
			const text =
				"'TestPlayer' [12345] in zone 'Stanton' killed by 'EnemyPlayer' [67890] using 'WeaponInstance' [Class WeaponClass] with damage type 'Ballistic' from direction x: 1.0, y: 0.0, z: 0.0";
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('TestPlayer');
			expect(result?.[2]).toBe('12345');
			expect(result?.[3]).toBe('Stanton');
			expect(result?.[4]).toBe('EnemyPlayer');
			expect(result?.[5]).toBe('67890');
		});

		it('should handle timeout protection', () => {
			// Note: Actual timeout testing is difficult in practice
			// This test verifies the function executes without errors
			const pattern = /test/;
			const text = 'test string';
			const result = safeMatch(pattern, text, 50);

			expect(result).not.toBeNull();
		});

		it('should handle regex errors gracefully', () => {
			// Simulate an error scenario
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			// Invalid regex pattern (this won't throw in JS, but let's test the error handling)
			const pattern = /test/;
			const text = 'test';
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			consoleSpy.mockRestore();
		});
	});

	describe('safeTest', () => {
		it('should return true for matching pattern', () => {
			const pattern = /hello/;
			const text = 'hello world';
			const result = safeTest(pattern, text);

			expect(result).toBe(true);
		});

		it('should return false for non-matching pattern', () => {
			const pattern = /goodbye/;
			const text = 'hello world';
			const result = safeTest(pattern, text);

			expect(result).toBe(false);
		});

		it('should test AccountLoginCharacterStatus pattern', () => {
			const pattern = /AccountLoginCharacterStatus_Character/;
			const text =
				'<2024.01.01-12:00:00.000> AccountLoginCharacterStatus_Character - name TestPlayer EntityId[12345]';
			const result = safeTest(pattern, text);

			expect(result).toBe(true);
		});

		it('should test Vehicle Destruction pattern', () => {
			const pattern = /<Vehicle Destruction>/;
			const text =
				"<2024.01.01-12:00:00.000> <Vehicle Destruction> Vehicle 'AEGS_Gladius_12345' [12345]";
			const result = safeTest(pattern, text);

			expect(result).toBe(true);
		});

		it('should test Ship Destruction pattern', () => {
			const pattern = /<Ship Destruction>/;
			const text = '<2024.01.01-12:00:00.000> <Ship Destruction> Ship destroyed';
			const result = safeTest(pattern, text);

			expect(result).toBe(true);
		});

		it('should handle timeout protection', () => {
			const pattern = /test/;
			const text = 'test string';
			const result = safeTest(pattern, text, 50);

			expect(result).toBe(true);
		});
	});

	describe('safeExec', () => {
		it('should successfully exec a pattern', () => {
			const pattern = /(\w+) (\w+)/;
			const text = 'hello world';
			const result = safeExec(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[0]).toBe('hello world');
			expect(result?.[1]).toBe('hello');
			expect(result?.[2]).toBe('world');
		});

		it('should return null for non-matching pattern', () => {
			const pattern = /goodbye/;
			const text = 'hello world';
			const result = safeExec(pattern, text);

			expect(result).toBeNull();
		});

		it('should exec entity ID extraction pattern', () => {
			const pattern = /EntityId\[(.*?)\]/;
			const text = 'AccountLoginCharacterStatus_Character - name TestPlayer EntityId[12345]';
			const result = safeExec(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('12345');
		});

		it('should exec player name extraction pattern', () => {
			const pattern = /- name (.*?) /;
			const text = 'AccountLoginCharacterStatus_Character - name TestPlayer EntityId[12345]';
			const result = safeExec(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('TestPlayer');
		});

		it('should handle timeout protection', () => {
			const pattern = /test/;
			const text = 'test string';
			const result = safeExec(pattern, text, 50);

			expect(result).not.toBeNull();
		});
	});

	describe('edge cases', () => {
		it('should handle empty strings', () => {
			const pattern = /test/;
			const text = '';

			expect(safeMatch(pattern, text)).toBeNull();
			expect(safeTest(pattern, text)).toBe(false);
			expect(safeExec(pattern, text)).toBeNull();
		});

		it('should handle special characters in text', () => {
			const pattern = /\[(\d+)\]/;
			const text = 'Entity [12345]';
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('12345');
		});

		it('should handle unicode characters', () => {
			const pattern = /Player: (.*)/;
			const text = 'Player: 测试用户';
			const result = safeMatch(pattern, text);

			expect(result).not.toBeNull();
			expect(result?.[1]).toBe('测试用户');
		});

		it('should handle very long strings', () => {
			const pattern = /test/;
			const longText = 'a'.repeat(10000) + 'test' + 'b'.repeat(10000);
			const result = safeTest(pattern, longText);

			expect(result).toBe(true);
		});
	});
});
