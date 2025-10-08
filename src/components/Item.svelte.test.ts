import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Item from './Item.svelte';
import type { Log } from '../types';

describe('Item Component', () => {
	// Mock date-fns formatDistance
	vi.mock('date-fns', () => ({
		formatDistance: vi.fn((date: Date, baseDate: Date, options?: any) => {
			return '5 minutes ago';
		})
	}));

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render log item with emoji and line', async () => {
			const screen = render(Item, {
				emoji: '🛜',
				line: 'TestPlayer connected to the game',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Connection log',
				player: 'TestPlayer',
				open: false
			});

			expect(screen.getByText('🛜')).toBeTruthy();
			expect(screen.getByText('TestPlayer connected to the game')).toBeTruthy();
		});

		it('should display formatted timestamp', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Test log',
				player: 'TestPlayer',
				open: false
			};

			const screen = render(Item, props);

			expect(screen.getByText(/5 minutes ago/)).toBeTruthy();
		});

		it('should display player name in metadata', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Test log',
				player: 'TestPlayer',
				open: false
			};

			const screen = render(Item, props);

			expect(screen.getByText(/TestPlayer/)).toBeTruthy();
		});

		it('should display reportedBy when provided', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Test log',
				player: 'TestPlayer',
				reportedBy: ['FriendPlayer'],
				open: false
			};

			const screen = render(Item, props);

			expect(screen.getByText(/FriendPlayer/)).toBeTruthy();
		});
	});

	describe('Actor Death Event Type', () => {
		it('should render actor death event correctly', async () => {
			const props = {
				emoji: '😵',
				line: 'TestPlayer killed by EnemyPlayer',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Actor Death log',
				player: 'TestPlayer',
				open: false,
				eventType: 'actor_death' as const,
				metadata: {
					victimName: 'TestPlayer',
					victimId: '12345',
					zone: 'Stanton_Unknown',
					killerName: 'EnemyPlayer',
					killerId: '67890',
					weaponClass: 'Ballistic_Rifle',
					damageType: 'Ballistic'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/TestPlayer was killed/)).toBeTruthy();
			expect(screen.getByText(/EnemyPlayer/)).toBeTruthy();
		});

		it('should render suicide event', async () => {
			const props = {
				emoji: '😵',
				line: 'TestPlayer committed suicide',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Suicide log',
				player: 'TestPlayer',
				open: false,
				eventType: 'actor_death' as const,
				metadata: {
					victimName: 'TestPlayer',
					victimId: '12345',
					zone: 'Stanton_Unknown',
					killerName: 'TestPlayer',
					killerId: '12345',
					damageType: 'Suicide'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/committed suicide/)).toBeTruthy();
		});

		it('should render self-destruct event', async () => {
			const props = {
				emoji: '💥',
				line: 'TestPlayer killed by self-destruct',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Self-destruct log',
				player: 'TestPlayer',
				open: false,
				eventType: 'actor_death' as const,
				metadata: {
					victimName: 'TestPlayer',
					victimId: '12345',
					zone: 'Gladius_Unknown',
					killerName: 'EnemyPlayer',
					killerId: '67890',
					damageType: 'SelfDestruct'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/self destructed/)).toBeTruthy();
		});

		it('should check and display NPC victim name', async () => {
			const props = {
				emoji: '🗡️',
				line: 'NPC killed',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> NPC death',
				player: 'TestPlayer',
				open: false,
				eventType: 'actor_death' as const,
				metadata: {
					victimName: 'PU_Human',
					victimId: '12345',
					zone: 'Stanton_Unknown',
					killerName: 'TestPlayer',
					killerId: '67890',
					damageType: 'Ballistic'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/NPC was killed/)).toBeTruthy();
		});
	});

	describe('Vehicle Control Flow Event Type', () => {
		it('should render vehicle control event', async () => {
			const props = {
				emoji: '🚀',
				line: 'TestPlayer boarded AEGS_Gladius',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Vehicle control log',
				player: 'TestPlayer',
				open: false,
				eventType: 'vehicle_control_flow' as const,
				metadata: {
					vehicleName: 'AEGS_Gladius_12345'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/TestPlayer controls a/)).toBeTruthy();
		});
	});

	describe('Killing Spree Event Type', () => {
		it('should render killing spree with special styling', async () => {
			const props = {
				emoji: '🎯',
				line: 'TestPlayer is on a killing spree (5 kills)',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Killing spree',
				player: 'TestPlayer',
				open: false,
				eventType: 'killing_spree' as const
			};

			const screen = render(Item, props);

			expect(screen.getByText(/killing spree/)).toBeTruthy();
			expect(screen.container.querySelector('.bg-red-500\\/10')).toBeTruthy();
		});

		it('should show expand/collapse indicator for killing spree', async () => {
			const props = {
				emoji: '🎯',
				line: 'TestPlayer is on a killing spree (5 kills)',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Killing spree',
				player: 'TestPlayer',
				open: false,
				eventType: 'killing_spree' as const
			};

			const screen = render(Item, props);

			expect(screen.getByText('▶')).toBeTruthy();
		});
	});

	describe('Location Change Event Type', () => {
		it('should render location change event', async () => {
			const props = {
				emoji: '🔍',
				line: 'TestPlayer requested inventory',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Location change',
				player: 'TestPlayer',
				open: false,
				eventType: 'location_change' as const,
				metadata: {
					location: 'Port_Olisar'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText(/requested inventory in Port Olisar/)).toBeTruthy();
		});
	});

	describe('System Quit Event Type', () => {
		it('should render system quit event', async () => {
			const props = {
				emoji: '👋',
				line: 'TestPlayer quit the game',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> System quit',
				player: 'TestPlayer',
				open: false,
				eventType: 'system_quit' as const
			};

			const screen = render(Item, props);

			expect(screen.getByText(/left the game/)).toBeTruthy();
		});
	});

	describe('Destruction Event Type', () => {
		it('should render destruction event', async () => {
			const props = {
				emoji: '💥',
				line: 'Gladius destroyed',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Vehicle destruction',
				player: 'TestPlayer',
				open: false,
				eventType: 'destruction' as const,
				metadata: {
					vehicleName: 'AEGS_Gladius_12345',
					causeName: 'EnemyPlayer',
					destroyLevelTo: '2'
				}
			};

			const screen = render(Item, props);

			expect(screen.getByText('💥')).toBeTruthy();
		});
	});

	describe('Interactive Features', () => {
		it('should toggle open state when clicked', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Original log text for testing',
				player: 'TestPlayer',
				open: false
			};

			const screen = render(Item, props);

			const button = screen.container.querySelector('button');
			expect(button).toBeTruthy();

			// Click to open
			await button?.click();

			// Should show original text when open
			expect(screen.getByText(/Original log text for testing/)).toBeTruthy();
		});

		it('should not show original text when closed', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Original log text that should be hidden',
				player: 'TestPlayer',
				open: false
			};

			const screen = render(Item, props);

			// Original text should not be visible when closed
			const hiddenText = screen.container.textContent?.includes(
				'Original log text that should be hidden'
			);
			expect(hiddenText).toBe(false);
		});
	});

	describe('Child Item Rendering', () => {
		it('should render as child item with smaller text', async () => {
			const props = {
				emoji: '🗡️',
				line: 'Kill #1',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Kill log',
				player: 'TestPlayer',
				open: false,
				child: true
			};

			const screen = render(Item, props);

			// Child items should have smaller emoji (text-xs class)
			const emojiContainer = screen.container.querySelector('.text-xs');
			expect(emojiContainer).toBeTruthy();
		});
	});

	describe('Helper Functions', () => {
		it('should convert camel case to words', () => {
			// This tests the convertCamelCaseToWords function indirectly
			const props = {
				emoji: '😵',
				line: 'Death by vehicle destruction',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Death log',
				player: 'TestPlayer',
				open: false,
				eventType: 'actor_death' as const,
				metadata: {
					victimName: 'TestPlayer',
					victimId: '12345',
					zone: 'Stanton_Unknown',
					killerName: 'EnemyPlayer',
					killerId: '67890',
					damageType: 'VehicleDestruction'
				}
			};

			const screen = render(Item, props);

			// Should convert 'VehicleDestruction' to 'vehicle destruction'
			expect(screen.getByText(/vehicle destruction/)).toBeTruthy();
		});
	});

	describe('Clipboard Copy', () => {
		it('should show copy button when item is open', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Test original log',
				player: 'TestPlayer',
				open: true
			};

			const screen = render(Item, props);

			expect(screen.getByText('📋')).toBeTruthy();
		});

		it('should not show copy button when item is closed', async () => {
			const props = {
				emoji: '🛜',
				line: 'Test log entry',
				timestamp: new Date().toISOString(),
				original: '<2024.01.01-12:00:00.000> Test original log',
				player: 'TestPlayer',
				open: false
			};

			const screen = render(Item, props);

			const hasCopyButton = screen.container.textContent?.includes('📋');
			expect(hasCopyButton).toBe(false);
		});
	});
});
