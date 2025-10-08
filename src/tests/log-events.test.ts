import { describe, it, expect } from 'vitest';
import { safeMatch } from '../lib/regex-utils';

/**
 * Integration tests for log event parsing
 * Tests real-world log patterns from Star Citizen Game.log
 */

describe('Log Event Parsing', () => {
	describe('Player Connection Events', () => {
		it('should parse player connection with EntityId', () => {
			const logLine =
				'<2024.06.07-12:34:56:789> AccountLoginCharacterStatus_Character - name TestPlayer EntityId[1234567890]';

			const isConnectionEvent = /AccountLoginCharacterStatus_Character/.test(logLine);
			expect(isConnectionEvent).toBe(true);

			const nameMatch = safeMatch(/- name (.*?) /, logLine);
			expect(nameMatch?.[1]).toBe('TestPlayer');

			const entityIdMatch = safeMatch(/EntityId\[(.*?)\]/, logLine);
			expect(entityIdMatch?.[1]).toBe('1234567890');
		});

		it('should parse player connection with special characters in name', () => {
			const logLine =
				'<2024.06.07-12:34:56:789> AccountLoginCharacterStatus_Character - name Player-Name_123 EntityId[1234567890]';

			const nameMatch = safeMatch(/- name (.*?) /, logLine);
			expect(nameMatch?.[1]).toBe('Player-Name_123');
		});
	});

	describe('Actor Death Events', () => {
		it('should parse standard actor death', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'VictimPlayer' [12345] in zone 'Stanton_Crusader' killed by 'KillerPlayer' [67890] using 'wpn_rifle_ballistic_01' [Class Ballistic_Rifle] with damage type 'Ballistic' from direction x: 1.0, y: 0.5, z: -0.3";

			const isActorDeath = /<Actor Death>/.test(logLine);
			expect(isActorDeath).toBe(true);

			const regex =
				/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)' from direction x: ([\d\.\-]+), y: ([\d\.\-]+), z: ([\d\.\-]+)/;
			const match = safeMatch(regex, logLine);

			expect(match).toBeTruthy();
			expect(match?.[1]).toBe('VictimPlayer'); // victimName
			expect(match?.[2]).toBe('12345'); // victimId
			expect(match?.[3]).toBe('Stanton_Crusader'); // zone
			expect(match?.[4]).toBe('KillerPlayer'); // killerName
			expect(match?.[5]).toBe('67890'); // killerId
			expect(match?.[6]).toBe('wpn_rifle_ballistic_01'); // weaponInstance
			expect(match?.[7]).toBe('Ballistic_Rifle'); // weaponClass
			expect(match?.[8]).toBe('Ballistic'); // damageType
		});

		it('should parse suicide event', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'SuicidePlayer' [12345] in zone 'Stanton_Unknown' killed by 'SuicidePlayer' [12345] using 'unknown' [Class unknown] with damage type 'Suicide' from direction x: 0.0, y: 0.0, z: 0.0";

			const regex =
				/'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\] with damage type '([^']+)'/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toBe('SuicidePlayer');
			expect(match?.[8]).toBe('Suicide');
		});

		it('should parse NPC death', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'PU_SecurityGuard_01' [12345] in zone 'Stanton_ArcCorp' killed by 'PlayerName' [67890] using 'wpn_pistol' [Class Ballistic_Pistol] with damage type 'Ballistic' from direction x: 1.0, y: 0.0, z: 0.0";

			const regex = /'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)'/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toContain('PU_'); // NPC indicator
			expect(match?.[4]).toBe('PlayerName');
		});

		it('should parse kopion death', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CAactor::Kill: 'kopion_tier1' [12345] in zone 'Stanton_Unknown' killed by 'PlayerName' [67890] using 'wpn_rifle' [Class Rifle] with damage type 'Ballistic' from direction x: 1.0, y: 0.0, z: 0.0";

			const regex = /'([^']+)' \[(\d+)\] in zone/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1].toLowerCase()).toContain('kopion');
		});

		it('should parse self-destruct death', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'VictimPlayer' [12345] in zone 'Gladius_Cockpit' killed by 'OwnerPlayer' [67890] using 'unknown' [Class unknown] with damage type 'SelfDestruct' from direction x: 0.0, y: 0.0, z: 0.0";

			const regex = /with damage type '([^']+)'/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toBe('SelfDestruct');
		});

		it('should parse vehicle destruction death', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'VictimPlayer' [12345] in zone 'Gladius_Cockpit' killed by 'KillerPlayer' [67890] using 'vehicle' [Class Vehicle] with damage type 'VehicleDestruction' from direction x: 0.0, y: 0.0, z: 0.0";

			const regex = /with damage type '([^']+)'/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toBe('VehicleDestruction');
		});
	});

	describe('Vehicle Destruction Events', () => {
		it('should parse vehicle destruction event', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Vehicle Destruction> Vehicle 'AEGS_Gladius_12345' [12345] caused by 'EnemyPlayer' [67890] destroyLevel from 'None' to 'HardDeath'";

			const isVehicleDestruction = /<Vehicle Destruction>/.test(logLine);
			expect(isVehicleDestruction).toBe(true);

			const vehicleMatch = safeMatch(/Vehicle '(.*?)' \[.*?\]/, logLine);
			expect(vehicleMatch?.[1]).toBe('AEGS_Gladius_12345');

			const causeMatch = safeMatch(/caused by '(.*?)' \[.*?\]/, logLine);
			expect(causeMatch?.[1]).toBe('EnemyPlayer');

			const destroyLevelMatch = safeMatch(/destroyLevel from '(.*?)' to '(.*?)'/, logLine);
			expect(destroyLevelMatch?.[1]).toBe('None');
			expect(destroyLevelMatch?.[2]).toBe('HardDeath');
		});

		it('should parse soft death vehicle destruction', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Vehicle Destruction> Vehicle 'MISC_Prospector_12345' [12345] caused by 'Environment' [0] destroyLevel from 'None' to 'SoftDeath'";

			const destroyLevelMatch = safeMatch(/destroyLevel from '(.*?)' to '(.*?)'/, logLine);
			expect(destroyLevelMatch?.[2]).toBe('SoftDeath');
		});

		it('should parse different ship manufacturers', () => {
			const shipNames = [
				'AEGS_Gladius_12345',
				'ANVL_Carrack_67890',
				'DRAK_Cutlass_Red_11111',
				'MISC_Freelancer_22222',
				'RSI_Aurora_MR_33333'
			];

			for (const shipName of shipNames) {
				const logLine = `<2024.06.07-12:34:56:789> <Vehicle Destruction> Vehicle '${shipName}' [12345] caused by 'Player' [67890] destroyLevel from 'None' to 'HardDeath'`;

				const vehicleMatch = safeMatch(/Vehicle '(.*?)' \[.*?\]/, logLine);
				expect(vehicleMatch?.[1]).toBe(shipName);
			}
		});
	});

	describe('Vehicle Control Flow Events', () => {
		it('should parse ship boarding event', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Vehicle Control Flow> EntitySpawner spawned vehicle 'AEGS_Gladius_1' [12345]";

			const isVehicleControl = /<Vehicle Control Flow>/.test(logLine);
			expect(isVehicleControl).toBe(true);

			const shipNameMatch = safeMatch(/'([A-Za-z0-9_]+)_\d+'/, logLine);
			expect(shipNameMatch?.[1]).toBe('AEGS_Gladius');

			const shipIdMatch = safeMatch(/\[(\d+)\]/, logLine);
			expect(shipIdMatch?.[1]).toBe('12345');
		});

		it('should parse various ship types', () => {
			const ships = ['AEGS_Gladius', 'ANVL_Hornet_F7C', 'DRAK_Cutlass_Black'];

			for (const ship of ships) {
				const logLine = `<2024.06.07-12:34:56:789> <Vehicle Control Flow> EntitySpawner spawned vehicle '${ship}_1' [12345]`;

				const shipNameMatch = safeMatch(/'([A-Za-z0-9_]+)_\d+'/, logLine);
				expect(shipNameMatch?.[1]).toBe(ship);
			}
		});
	});

	describe('Inventory Request Events', () => {
		it('should parse location inventory request', () => {
			const logLine =
				'<2024.06.07-12:34:56:789> <RequestLocationInventory> Player[TestPlayer] Location[Port_Olisar]';

			const isInventoryRequest = /<RequestLocationInventory>/.test(logLine);
			expect(isInventoryRequest).toBe(true);

			const playerMatch = safeMatch(/Player\[([^\]]+)\]/, logLine);
			expect(playerMatch?.[1]).toBe('TestPlayer');

			const locationMatch = safeMatch(/Location\[([^\]]+)\]/, logLine);
			expect(locationMatch?.[1]).toBe('Port_Olisar');
		});

		it('should parse different locations', () => {
			const locations = [
				'Port_Olisar',
				'Lorville',
				'Area18',
				'New_Babbage',
				'Grim_HEX',
				'Everus_Harbor'
			];

			for (const location of locations) {
				const logLine = `<2024.06.07-12:34:56:789> <RequestLocationInventory> Player[TestPlayer] Location[${location}]`;

				const locationMatch = safeMatch(/Location\[([^\]]+)\]/, logLine);
				expect(locationMatch?.[1]).toBe(location);
			}
		});
	});

	describe('System Quit Events', () => {
		it('should parse system quit event', () => {
			const logLine = '<2024.06.07-12:34:56:789> <SystemQuit> Player disconnected from game';

			const isSystemQuit = /<SystemQuit>/.test(logLine);
			expect(isSystemQuit).toBe(true);
		});
	});

	describe('Timestamp Parsing', () => {
		it('should parse standard timestamp with milliseconds', () => {
			const logLine = '<2024.06.07-12:34:56:789> Event data';

			const timestampMatch = safeMatch(/<([^>]+)>/, logLine);
			expect(timestampMatch?.[1]).toBe('2024.06.07-12:34:56:789');
		});

		it('should parse timestamp without milliseconds', () => {
			const logLine = '<2024.06.07-12:34:56> Event data';

			const timestampMatch = safeMatch(/<([^>]+)>/, logLine);
			expect(timestampMatch?.[1]).toBe('2024.06.07-12:34:56');
		});

		it('should parse various timestamp formats', () => {
			const timestamps = [
				'2024.01.01-00:00:00:000',
				'2024.12.31-23:59:59:999',
				'2024.06.15-12:30:45:123',
				'2024.06.15-12:30:45'
			];

			for (const timestamp of timestamps) {
				const logLine = `<${timestamp}> Event data`;

				const timestampMatch = safeMatch(/<([^>]+)>/, logLine);
				expect(timestampMatch?.[1]).toBe(timestamp);
			}
		});
	});

	describe('Edge Cases', () => {
		it('should handle log lines with multiple brackets', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'Player[Name]' [12345] in zone 'Zone[1]' killed by 'Killer' [67890] using 'Weapon[Type]' [Class Weapon] with damage type 'Ballistic' from direction x: 1.0, y: 0.0, z: 0.0";

			const victimMatch = safeMatch(/'([^']+)' \[(\d+)\] in zone/, logLine);
			expect(victimMatch?.[1]).toBe('Player[Name]');
			expect(victimMatch?.[2]).toBe('12345');
		});

		it('should handle log lines with special characters', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'Player-Name_123' [12345] in zone 'Stanton_Crusader-Alpha' killed by 'Killer_Name.Test' [67890] using 'wpn_rifle-ballistic_01.variant' [Class Ballistic_Rifle] with damage type 'Ballistic' from direction x: 1.0, y: 0.5, z: -0.3";

			const regex = /'([^']+)' \[(\d+)\] in zone '([^']+)' killed by '([^']+)'/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toBe('Player-Name_123');
			expect(match?.[3]).toBe('Stanton_Crusader-Alpha');
			expect(match?.[4]).toBe('Killer_Name.Test');
		});

		it('should handle empty or unknown values', () => {
			const logLine =
				"<2024.06.07-12:34:56:789> <Actor Death> CActor::Kill: 'Player' [12345] in zone 'Unknown' killed by 'unknown' [0] using 'unknown' [Class unknown] with damage type 'unknown' from direction x: 0.0, y: 0.0, z: 0.0";

			const regex = /killed by '([^']+)' \[(\d+)\] using '([^']+)' \[Class ([^\]]+)\]/;
			const match = safeMatch(regex, logLine);

			expect(match?.[1]).toBe('unknown');
			expect(match?.[2]).toBe('0');
			expect(match?.[3]).toBe('unknown');
			expect(match?.[4]).toBe('unknown');
		});

		it('should handle very long player names', () => {
			const longName = 'A'.repeat(100);
			const logLine = `<2024.06.07-12:34:56:789> AccountLoginCharacterStatus_Character - name ${longName} EntityId[1234567890]`;

			const nameMatch = safeMatch(/- name (.*?) /, logLine);
			expect(nameMatch?.[1]).toBe(longName);
		});
	});
});
