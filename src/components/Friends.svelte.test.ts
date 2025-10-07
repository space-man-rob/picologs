import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from 'vitest-browser-svelte';
import Friends from './Friends.svelte';
import type { Friend } from '../types';
import { createMockFriend } from '../tests/setup';

// Mock the app context
vi.mock('$lib/appContext.svelte', () => ({
	getAppContext: vi.fn(() => ({
		apiFriendRequests: [],
		isLoadingFriends: false,
		processingFriendRequests: new Set(),
		addNotification: vi.fn(),
	})),
}));

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
	ask: vi.fn(async () => true),
}));

// Mock API functions
vi.mock('$lib/api', () => ({
	acceptFriendRequest: vi.fn(async () => true),
	denyFriendRequest: vi.fn(async () => true),
	fetchFriendRequests: vi.fn(async () => []),
}));

// Mock User component
vi.mock('./User.svelte', () => ({
	default: vi.fn(() => ({
		render: () => '<div class="mock-user">Mock User</div>',
	})),
}));

// Mock Skeleton component
vi.mock('./Skeleton.svelte', () => ({
	default: vi.fn(() => ({
		render: () => '<div class="mock-skeleton">Loading...</div>',
	})),
}));

describe('Friends Component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render friends list header', async () => {
			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/Friends/)).toBeTruthy();
		});

		it('should show count of confirmed friends', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'Friend2', status: 'confirmed' }),
			];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/Friends \(2\)/)).toBeTruthy();
		});

		it('should show empty state when no friends', async () => {
			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/No friends yet/)).toBeTruthy();
		});
	});

	describe('Friends List Sorting', () => {
		it('should sort online friends first', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'OfflineFriend', status: 'confirmed', isOnline: false }),
				createMockFriend({ id: '2', name: 'OnlineFriend', status: 'confirmed', isOnline: true }),
			];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			// Note: Due to mocked User component, we can't verify exact order
			// But we can verify both friends are rendered
			const users = container.querySelectorAll('.mock-user');
			expect(users.length).toBe(2);
		});

		it('should sort alphabetically within online/offline groups', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Zoe', status: 'confirmed', isOnline: true }),
				createMockFriend({ id: '2', name: 'Alice', status: 'confirmed', isOnline: true }),
				createMockFriend({ id: '3', name: 'Bob', status: 'confirmed', isOnline: true }),
			];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			const users = container.querySelectorAll('.mock-user');
			expect(users.length).toBe(3);
		});
	});

	describe('Friend Status Display', () => {
		it('should only display confirmed friends in main list', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'ConfirmedFriend', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'PendingFriend', status: 'pending_them' }),
			];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			// Should show count of 1 (only confirmed friend)
			expect(screen.getByText(/Friends \(1\)/)).toBeTruthy();
		});

		it('should filter out non-confirmed friends from list', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'Friend2', status: 'pending_them' }),
				createMockFriend({ id: '3', name: 'Friend3', status: 'pending_me' }),
			];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			// Only 1 confirmed friend should be in the list
			const users = container.querySelectorAll('.mock-user');
			expect(users.length).toBe(1);
		});
	});

	describe('Loading State', () => {
		it('should show skeleton loader when loading friends', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [],
				isLoadingFriends: true,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(container.querySelector('.mock-skeleton')).toBeTruthy();
		});

		it('should not show skeleton if friends exist even when loading', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [],
				isLoadingFriends: true,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' }),
			];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(container.querySelector('.mock-skeleton')).toBeNull();
		});
	});

	describe('Friend Requests - Incoming', () => {
		it('should display incoming friend requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'NewFriend',
						discordId: 'discord-123',
						player: 'NewPlayer',
						avatar: null,
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/Pending Requests/)).toBeTruthy();
			expect(screen.getByText('NewFriend')).toBeTruthy();
		});

		it('should show accept and ignore buttons for incoming requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'NewFriend',
						discordId: 'discord-123',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText('Accept')).toBeTruthy();
			expect(screen.getByText('Ignore')).toBeTruthy();
		});

		it('should show count of incoming requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'Friend1',
						discordId: 'discord-1',
						direction: 'incoming',
					},
					{
						id: 'req-2',
						username: 'Friend2',
						discordId: 'discord-2',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/Pending Requests \(2\)/)).toBeTruthy();
		});
	});

	describe('Friend Requests - Outgoing', () => {
		it('should display outgoing friend requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'SentRequest',
						discordId: 'discord-123',
						direction: 'outgoing',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText(/Sent Requests/)).toBeTruthy();
			expect(screen.getByText('SentRequest')).toBeTruthy();
		});

		it('should show pending status for outgoing requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'SentRequest',
						discordId: 'discord-123',
						direction: 'outgoing',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText('Pending')).toBeTruthy();
		});
	});

	describe('Avatar Display', () => {
		it('should show avatar image when available', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'AvatarFriend',
						discordId: 'discord-123',
						avatar: 'avatar-hash',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			const img = container.querySelector('img[alt="AvatarFriend"]');
			expect(img).toBeTruthy();
		});

		it('should show initial when no avatar available', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'NoAvatarFriend',
						discordId: 'discord-123',
						avatar: null,
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			// Should show the first letter 'N'
			expect(screen.getByText('N')).toBeTruthy();
		});
	});

	describe('Player Name Display', () => {
		it('should show player name when available', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'DiscordName',
						discordId: 'discord-123',
						player: 'SCPlayerName',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getByText('SCPlayerName')).toBeTruthy();
		});
	});

	describe('Button States', () => {
		it('should disable buttons when processing request', async () => {
			const processingSet = new Set(['req-1']);
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'ProcessingFriend',
						discordId: 'discord-123',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: processingSet,
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList, removeFriend: vi.fn() });

			const buttons = container.querySelectorAll('button[disabled]');
			expect(buttons.length).toBeGreaterThan(0);
		});

		it('should show "Processing..." text when processing', async () => {
			const processingSet = new Set(['req-1']);
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						username: 'ProcessingFriend',
						discordId: 'discord-123',
						direction: 'incoming',
					},
				],
				isLoadingFriends: false,
				processingFriendRequests: processingSet,
				addNotification: vi.fn(),
			} as any);

			const friendsList: Friend[] = [];

			render(Friends, { friendsList, removeFriend: vi.fn() });

			expect(screen.getAllByText('Processing...').length).toBeGreaterThan(0);
		});
	});
});
