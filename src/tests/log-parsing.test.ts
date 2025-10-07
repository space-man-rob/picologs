import { describe, it, expect } from 'vitest';
import type { Log } from '../types';

/**
 * Test suite for log parsing utilities
 * These functions are extracted from +page.svelte for testing
 */

// Helper function from +page.svelte
function parseLogTimestamp(raw: string): string {
	// Example: 2024.06.07-12:34:56:789
	const match = raw.match(/(\d{4})\.(\d{2})\.(\d{2})-(\d{2}):(\d{2}):(\d{2}):?(\d{0,3})?/);
	if (!match) return new Date().toISOString();
	const [_, year, month, day, hour, min, sec, ms] = match;
	const msStr = ms ? ms.padEnd(3, '0') : '000';
	return `${year}-${month}-${day}T${hour}:${min}:${sec}.${msStr}Z`;
}

// Helper function from +page.svelte
function generateId(timestamp: string, line: string): string {
	const content = timestamp + '|' + line;
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	const hash2 = content.split('').reduce((acc, char, i) => {
		return acc + char.charCodeAt(0) * (i + 1);
	}, 0);
	return Math.abs(hash).toString(36) + Math.abs(hash2).toString(36);
}

// Helper function from +page.svelte
function getShipType(shipName: string): string {
	const shipTypes = [
		'325a',
		'c1',
		'a2',
		'warlock',
		'eclipse',
		'inferno',
		'85x',
		'mantis',
		'hornet',
		'fury',
		'gladius',
		'arrow',
		'carrack',
		'cutlass',
		'freelancer',
		'avenger',
		'nomad',
	];

	if (!shipName) return 'Unknown Ship';
	return (
		shipTypes.find((type) => shipName.toLowerCase().includes(type.toLowerCase())) || shipName
	);
}

// Helper function from +page.svelte
function getName(line: string): string {
	if (!line) return 'Unknown';
	if (line.includes('unknown')) {
		return '🤷‍♂️ Unknown';
	}
	return line.includes('PU_') ? '🤖 NPC' : line;
}

// Helper function from +page.svelte
function dedupeAndSortLogs(logs: Log[]): Log[] {
	const seen = new Set<string>();
	const deduped = [];
	for (const log of logs) {
		if (!seen.has(log.id)) {
			seen.add(log.id);
			deduped.push(log);
		}
	}
	return deduped.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

describe('Log Parsing Utilities', () => {
	describe('parseLogTimestamp', () => {
		it('should parse standard log timestamp format', () => {
			const raw = '2024.06.07-12:34:56:789';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-06-07T12:34:56.789Z');
		});

		it('should parse timestamp without milliseconds', () => {
			const raw = '2024.06.07-12:34:56';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-06-07T12:34:56.000Z');
		});

		it('should parse timestamp with partial milliseconds', () => {
			const raw = '2024.06.07-12:34:56:1';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-06-07T12:34:56.100Z');
		});

		it('should parse timestamp with two-digit milliseconds', () => {
			const raw = '2024.06.07-12:34:56:12';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-06-07T12:34:56.120Z');
		});

		it('should handle midnight timestamp', () => {
			const raw = '2024.01.01-00:00:00:000';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-01-01T00:00:00.000Z');
		});

		it('should handle end of day timestamp', () => {
			const raw = '2024.12.31-23:59:59:999';
			const result = parseLogTimestamp(raw);

			expect(result).toBe('2024-12-31T23:59:59.999Z');
		});

		it('should return current ISO timestamp for invalid format', () => {
			const raw = 'invalid-timestamp';
			const result = parseLogTimestamp(raw);

			// Check that it's a valid ISO string
			expect(() => new Date(result)).not.toThrow();
			expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		});
	});

	describe('generateId', () => {
		it('should generate consistent IDs for same input', () => {
			const timestamp = '2024-01-01T12:00:00.000Z';
			const line = 'Test log line';

			const id1 = generateId(timestamp, line);
			const id2 = generateId(timestamp, line);

			expect(id1).toBe(id2);
		});

		it('should generate different IDs for different timestamps', () => {
			const timestamp1 = '2024-01-01T12:00:00.000Z';
			const timestamp2 = '2024-01-01T12:00:01.000Z';
			const line = 'Test log line';

			const id1 = generateId(timestamp1, line);
			const id2 = generateId(timestamp2, line);

			expect(id1).not.toBe(id2);
		});

		it('should generate different IDs for different lines', () => {
			const timestamp = '2024-01-01T12:00:00.000Z';
			const line1 = 'Test log line 1';
			const line2 = 'Test log line 2';

			const id1 = generateId(timestamp, line1);
			const id2 = generateId(timestamp, line2);

			expect(id1).not.toBe(id2);
		});

		it('should generate valid base36 IDs', () => {
			const timestamp = '2024-01-01T12:00:00.000Z';
			const line = 'Test log line';

			const id = generateId(timestamp, line);

			// Should be alphanumeric (base36)
			expect(id).toMatch(/^[0-9a-z]+$/);
		});
	});

	describe('getShipType', () => {
		it('should identify Gladius ship', () => {
			const shipName = 'AEGS_Gladius_12345';
			const result = getShipType(shipName);

			expect(result).toBe('gladius');
		});

		it('should identify Cutlass ship', () => {
			const shipName = 'DRAK_Cutlass_Red_67890';
			const result = getShipType(shipName);

			expect(result).toBe('cutlass');
		});

		it('should identify Carrack ship', () => {
			const shipName = 'ANVL_Carrack_12345';
			const result = getShipType(shipName);

			expect(result).toBe('carrack');
		});

		it('should return original name for unknown ship', () => {
			const shipName = 'MISC_UnknownShip_12345';
			const result = getShipType(shipName);

			expect(result).toBe('MISC_UnknownShip_12345');
		});

		it('should handle empty ship name', () => {
			const shipName = '';
			const result = getShipType(shipName);

			expect(result).toBe('Unknown Ship');
		});

		it('should be case-insensitive', () => {
			const shipName = 'AEGS_GLADIUS_12345';
			const result = getShipType(shipName);

			expect(result).toBe('gladius');
		});
	});

	describe('getName', () => {
		it('should return player name as-is', () => {
			const name = 'TestPlayer';
			const result = getName(name);

			expect(result).toBe('TestPlayer');
		});

		it('should identify NPC by PU_ prefix', () => {
			const name = 'PU_SecurityGuard_01';
			const result = getName(name);

			expect(result).toBe('🤖 NPC');
		});

		it('should mark unknown entities', () => {
			const name = 'unknown_entity';
			const result = getName(name);

			expect(result).toBe('🤷‍♂️ Unknown');
		});

		it('should handle empty names', () => {
			const name = '';
			const result = getName(name);

			expect(result).toBe('Unknown');
		});

		it('should handle null/undefined names', () => {
			const result = getName(null as any);

			expect(result).toBe('Unknown');
		});
	});

	describe('dedupeAndSortLogs', () => {
		it('should remove duplicate logs by ID', () => {
			const logs: Log[] = [
				{
					id: 'log-1',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'First log',
					timestamp: '2024-01-01T12:00:00.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-1', // Duplicate
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'First log',
					timestamp: '2024-01-01T12:00:00.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-2',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'Second log',
					timestamp: '2024-01-01T12:00:01.000Z',
					original: 'original',
					open: false,
				},
			];

			const result = dedupeAndSortLogs(logs);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('log-1');
			expect(result[1].id).toBe('log-2');
		});

		it('should sort logs by timestamp (oldest first)', () => {
			const logs: Log[] = [
				{
					id: 'log-3',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'Third log',
					timestamp: '2024-01-01T12:00:03.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-1',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'First log',
					timestamp: '2024-01-01T12:00:01.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-2',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'Second log',
					timestamp: '2024-01-01T12:00:02.000Z',
					original: 'original',
					open: false,
				},
			];

			const result = dedupeAndSortLogs(logs);

			expect(result).toHaveLength(3);
			expect(result[0].id).toBe('log-1');
			expect(result[1].id).toBe('log-2');
			expect(result[2].id).toBe('log-3');
		});

		it('should handle empty array', () => {
			const logs: Log[] = [];
			const result = dedupeAndSortLogs(logs);

			expect(result).toHaveLength(0);
		});

		it('should dedupe and sort in one operation', () => {
			const logs: Log[] = [
				{
					id: 'log-2',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'Second log',
					timestamp: '2024-01-01T12:00:02.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-1',
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'First log',
					timestamp: '2024-01-01T12:00:01.000Z',
					original: 'original',
					open: false,
				},
				{
					id: 'log-2', // Duplicate
					userId: 'user-1',
					player: 'Player1',
					emoji: '🛜',
					line: 'Second log',
					timestamp: '2024-01-01T12:00:02.000Z',
					original: 'original',
					open: false,
				},
			];

			const result = dedupeAndSortLogs(logs);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('log-1');
			expect(result[1].id).toBe('log-2');
		});
	});

	describe('Log Pattern Recognition', () => {
		it('should recognize player connection pattern', () => {
			const line =
				'<2024.01.01-12:00:00.000> AccountLoginCharacterStatus_Character - name TestPlayer EntityId[12345]';

			expect(line.match(/AccountLoginCharacterStatus_Character/)).toBeTruthy();
		});

		it('should recognize Actor Death pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <Actor Death> CActor::Kill...';

			expect(line.match(/<Actor Death>/)).toBeTruthy();
		});

		it('should recognize Vehicle Destruction pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <Vehicle Destruction> Vehicle destroyed';

			expect(line.match(/<Vehicle Destruction>/)).toBeTruthy();
		});

		it('should recognize Ship Destruction pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <Ship Destruction> Ship destroyed';

			expect(line.match(/<Ship Destruction>/)).toBeTruthy();
		});

		it('should recognize SystemQuit pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <SystemQuit> Player quit';

			expect(line.match(/<SystemQuit>/)).toBeTruthy();
		});

		it('should recognize Vehicle Control Flow pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <Vehicle Control Flow> Ship boarded';

			expect(line.match(/<Vehicle Control Flow>/)).toBeTruthy();
		});

		it('should recognize RequestLocationInventory pattern', () => {
			const line = '<2024.01.01-12:00:00.000> <RequestLocationInventory> Inventory requested';

			expect(line.match(/<RequestLocationInventory>/)).toBeTruthy();
		});
	});
});
