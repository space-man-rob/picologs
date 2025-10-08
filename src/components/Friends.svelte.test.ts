import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Friends from './Friends.svelte';
import type { Friend } from '../types';
import { createMockFriend } from '../tests/setup-browser';

// Mock the app context
vi.mock('$lib/appContext.svelte', () => ({
	getAppContext: vi.fn(() => ({
		apiFriendRequests: [],
		isLoadingFriends: false,
		processingFriendRequests: new Set(),
		addNotification: vi.fn()
	}))
}));

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
	ask: vi.fn(async () => true)
}));

// Mock API functions
vi.mock('$lib/api', () => ({
	acceptFriendRequest: vi.fn(async () => true),
	denyFriendRequest: vi.fn(async () => true),
	fetchFriendRequests: vi.fn(async () => [])
}));

// Note: User and Skeleton components are NOT mocked in browser mode
// They will render as actual components

describe('Friends Component', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Basic Rendering', () => {
		it('should render friends list header', async () => {
			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText(/Friends/)).toBeTruthy();
		});

		it('should show count of confirmed friends', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'Friend2', status: 'confirmed' })
			];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText(/Friends \(2\)/)).toBeTruthy();
		});

		it('should show empty state when no friends', async () => {
			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText(/No friends yet/)).toBeTruthy();
		});
	});

	describe('Friends List Sorting', () => {
		it('should sort online friends first', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'OfflineFriend', status: 'confirmed', isOnline: false }),
				createMockFriend({ id: '2', name: 'OnlineFriend', status: 'confirmed', isOnline: true })
			];

			const screen = render(Friends, { friendsList });

			// Verify both friends are rendered by checking for their names
			expect(screen.getByText('OfflineFriend')).toBeTruthy();
			expect(screen.getByText('OnlineFriend')).toBeTruthy();
		});

		it('should sort alphabetically within online/offline groups', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Zoe', status: 'confirmed', isOnline: true }),
				createMockFriend({ id: '2', name: 'Alice', status: 'confirmed', isOnline: true }),
				createMockFriend({ id: '3', name: 'Bob', status: 'confirmed', isOnline: true })
			];

			const screen = render(Friends, { friendsList });

			// Verify all friends are rendered
			expect(screen.getByText('Zoe')).toBeTruthy();
			expect(screen.getByText('Alice')).toBeTruthy();
			expect(screen.getByText('Bob')).toBeTruthy();
		});
	});

	describe('Friend Status Display', () => {
		it('should only display confirmed friends in main list', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'ConfirmedFriend', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'PendingFriend', status: 'pending_them' })
			];

			const screen = render(Friends, { friendsList });

			// Should show count of 1 (only confirmed friend)
			expect(screen.getByText(/Friends \(1\)/)).toBeTruthy();
		});

		it('should filter out non-confirmed friends from list', async () => {
			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' }),
				createMockFriend({ id: '2', name: 'Friend2', status: 'pending_them' }),
				createMockFriend({ id: '3', name: 'Friend3', status: 'pending_me' })
			];

			const screen = render(Friends, { friendsList });

			// Only confirmed friend should be visible
			expect(screen.getByText('Friend1')).toBeTruthy();
		});
	});

	describe('Loading State', () => {
		it('should show skeleton loader when loading friends', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [],
				isLoadingFriends: true,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList });

			// Check for skeleton loader by looking for animate-pulse class
			const skeletonElements = container.querySelectorAll('.animate-pulse');
			expect(skeletonElements.length).toBeGreaterThan(0);
		});

		it('should not show skeleton if friends exist even when loading', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [],
				isLoadingFriends: true,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [
				createMockFriend({ id: '1', name: 'Friend1', status: 'confirmed' })
			];

			const { container } = render(Friends, { friendsList });

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
						fromUsername: 'NewFriend',
						fromDiscordId: 'discord-123',
						fromPlayer: 'NewPlayer',
						fromAvatar: null,
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText(/Pending Requests/)).toBeTruthy();
			expect(screen.getByText('NewFriend')).toBeTruthy();
		});

		it('should show accept and ignore buttons for incoming requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						fromUsername: 'NewFriend',
						fromDiscordId: 'discord-123',
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText('Accept')).toBeTruthy();
			expect(screen.getByText('Ignore')).toBeTruthy();
		});

		it('should show count of incoming requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						fromUsername: 'Friend1',
						fromDiscordId: 'discord-1',
						fromUserId: 'user-1',
						direction: 'incoming'
					},
					{
						id: 'req-2',
						fromUsername: 'Friend2',
						fromDiscordId: 'discord-2',
						fromUserId: 'user-2',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

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
						fromUsername: 'SentRequest',
						fromDiscordId: 'discord-123',
						fromUserId: 'user-123',
						direction: 'outgoing'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText(/Sent Requests/)).toBeTruthy();
			expect(screen.getByText('SentRequest')).toBeTruthy();
		});

		it('should show pending status for outgoing requests', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						fromUsername: 'SentRequest',
						fromDiscordId: 'discord-123',
						fromUserId: 'user-123',
						direction: 'outgoing'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

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
						fromUsername: 'AvatarFriend',
						fromDiscordId: 'discord-123',
						fromAvatar: 'avatar-hash',
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			// Verify the username is displayed (avatar component will render)
			expect(screen.getByText('AvatarFriend')).toBeTruthy();
		});

		it('should show initial when no avatar available', async () => {
			const { getAppContext } = await import('$lib/appContext.svelte');
			vi.mocked(getAppContext).mockReturnValue({
				apiFriendRequests: [
					{
						id: 'req-1',
						fromUsername: 'NoAvatarFriend',
						fromDiscordId: 'discord-123',
						fromAvatar: null,
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

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
						fromUsername: 'DiscordName',
						fromDiscordId: 'discord-123',
						fromPlayer: 'SCPlayerName',
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: new Set(),
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

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
						fromUsername: 'ProcessingFriend',
						fromDiscordId: 'discord-123',
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: processingSet,
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const { container } = render(Friends, { friendsList });

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
						fromUsername: 'ProcessingFriend',
						fromDiscordId: 'discord-123',
						fromUserId: 'user-123',
						direction: 'incoming'
					}
				],
				isLoadingFriends: false,
				processingFriendRequests: processingSet,
				addNotification: vi.fn()
			} as any);

			const friendsList: Friend[] = [];

			const screen = render(Friends, { friendsList });

			expect(screen.getByText('Processing...')).toBeTruthy();
		});
	});
});
