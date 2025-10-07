/**
 * Tests for cache module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	loadCachedFriends,
	saveFriendsCache,
	loadCachedGroups,
	saveGroupsCache,
	loadCachedGroupMembers,
	saveGroupMembersCache,
	clearAllCache,
} from './cache';
import type { Friend, Group, GroupMember } from '../types';

// Mock Tauri store
const mockGet = vi.fn(async (key: string) => null);
const mockSet = vi.fn(async (key: string, value: any) => {});
const mockClear = vi.fn(async () => {});

vi.mock('@tauri-apps/plugin-store', () => ({
	load: vi.fn(async (filename: string, options?: any) => ({
		get: mockGet,
		set: mockSet,
		clear: mockClear,
	})),
}));

describe('Cache Module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Friends Cache', () => {
		it('should load cached friends', async () => {
			const mockFriends: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: null,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true,
				},
			];

			mockGet.mockResolvedValueOnce({
				data: mockFriends,
				timestamp: new Date().toISOString(),
			});

			const friends = await loadCachedFriends();

			expect(mockGet).toHaveBeenCalledWith('friends_cache');
			expect(friends).toEqual(mockFriends);
		});

		it('should return empty array when no cache exists', async () => {
			mockGet.mockResolvedValueOnce(null);

			const friends = await loadCachedFriends();

			expect(friends).toEqual([]);
		});

		it('should return empty array on error', async () => {
			mockGet.mockRejectedValueOnce(new Error('Storage error'));

			const friends = await loadCachedFriends();

			expect(friends).toEqual([]);
		});

		it('should save friends to cache with timestamp', async () => {
			const friends: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: null,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true,
				},
			];

			await saveFriendsCache(friends);

			expect(mockSet).toHaveBeenCalled();
			const [key, value] = mockSet.mock.calls[0];
			expect(key).toBe('friends_cache');
			expect(value.data).toEqual(friends);
			expect(value.timestamp).toBeTruthy();
		});

		it('should silently fail on save error', async () => {
			mockSet.mockRejectedValueOnce(new Error('Storage error'));

			await expect(saveFriendsCache([])).resolves.toBeUndefined();
		});
	});

	describe('Groups Cache', () => {
		it('should load cached groups', async () => {
			const mockGroups: Group[] = [
				{
					id: 'group-1',
					name: 'Test Group',
					description: 'Test description',
					avatar: null,
					tags: [],
					ownerId: 'user-1',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];

			mockGet.mockResolvedValueOnce({
				data: mockGroups,
				timestamp: new Date().toISOString(),
			});

			const groups = await loadCachedGroups();

			expect(mockGet).toHaveBeenCalledWith('groups_cache');
			expect(groups).toEqual(mockGroups);
		});

		it('should return empty array when no cache exists', async () => {
			mockGet.mockResolvedValueOnce(null);

			const groups = await loadCachedGroups();

			expect(groups).toEqual([]);
		});

		it('should save groups to cache', async () => {
			const groups: Group[] = [
				{
					id: 'group-1',
					name: 'Test Group',
					description: 'Test description',
					avatar: null,
					tags: [],
					ownerId: 'user-1',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			];

			await saveGroupsCache(groups);

			expect(mockSet).toHaveBeenCalled();
			const [key, value] = mockSet.mock.calls[0];
			expect(key).toBe('groups_cache');
			expect(value.data).toEqual(groups);
		});

		it('should handle save errors gracefully', async () => {
			mockSet.mockRejectedValueOnce(new Error('Storage error'));

			await expect(saveGroupsCache([])).resolves.toBeUndefined();
		});
	});

	describe('Group Members Cache', () => {
		it('should load cached group members as Map', async () => {
			const mockMembers: Record<string, GroupMember[]> = {
				'group-1': [
					{
						id: 'member-1',
						groupId: 'group-1',
						userId: 'user-1',
						discordId: 'discord-1',
						username: 'User1',
						avatar: null,
						player: 'Player1',
						role: 'owner',
						canInvite: true,
						canRemoveMembers: true,
						canEditGroup: true,
						joinedAt: new Date().toISOString(),
					},
				],
			};

			mockGet.mockResolvedValueOnce({
				data: mockMembers,
				timestamp: new Date().toISOString(),
			});

			const members = await loadCachedGroupMembers();

			expect(mockGet).toHaveBeenCalledWith('group_members_cache');
			expect(members).toBeInstanceOf(Map);
			expect(members.get('group-1')).toEqual(mockMembers['group-1']);
		});

		it('should return empty Map when no cache exists', async () => {
			mockGet.mockResolvedValueOnce(null);

			const members = await loadCachedGroupMembers();

			expect(members).toBeInstanceOf(Map);
			expect(members.size).toBe(0);
		});

		it('should return empty Map on error', async () => {
			mockGet.mockRejectedValueOnce(new Error('Storage error'));

			const members = await loadCachedGroupMembers();

			expect(members).toBeInstanceOf(Map);
			expect(members.size).toBe(0);
		});

		it('should save group members Map as object', async () => {
			const members = new Map<string, GroupMember[]>();
			members.set('group-1', [
				{
					id: 'member-1',
					groupId: 'group-1',
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'User1',
					avatar: null,
					player: 'Player1',
					role: 'owner',
					canInvite: true,
					canRemoveMembers: true,
					canEditGroup: true,
					joinedAt: new Date().toISOString(),
				},
			]);

			await saveGroupMembersCache(members);

			expect(mockSet).toHaveBeenCalled();
			const [key, value] = mockSet.mock.calls[0];
			expect(key).toBe('group_members_cache');
			expect(value.data).toEqual(Object.fromEntries(members));
		});

		it('should handle multiple groups in cache', async () => {
			const members = new Map<string, GroupMember[]>();
			members.set('group-1', [
				{
					id: 'member-1',
					groupId: 'group-1',
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'User1',
					avatar: null,
					player: null,
					role: 'owner',
					canInvite: true,
					canRemoveMembers: true,
					canEditGroup: true,
					joinedAt: new Date().toISOString(),
				},
			]);
			members.set('group-2', [
				{
					id: 'member-2',
					groupId: 'group-2',
					userId: 'user-2',
					discordId: 'discord-2',
					username: 'User2',
					avatar: null,
					player: null,
					role: 'member',
					canInvite: false,
					canRemoveMembers: false,
					canEditGroup: false,
					joinedAt: new Date().toISOString(),
				},
			]);

			await saveGroupMembersCache(members);

			const [, value] = mockSet.mock.calls[0];
			expect(Object.keys(value.data)).toHaveLength(2);
			expect(value.data['group-1']).toBeDefined();
			expect(value.data['group-2']).toBeDefined();
		});
	});

	describe('Clear Cache', () => {
		it('should clear all cached data', async () => {
			await clearAllCache();

			expect(mockClear).toHaveBeenCalled();
		});

		it('should silently fail on clear error', async () => {
			mockClear.mockRejectedValueOnce(new Error('Storage error'));

			await expect(clearAllCache()).resolves.toBeUndefined();
		});
	});

	describe('Cache Data Structure', () => {
		it('should include timestamp in cached data', async () => {
			await saveFriendsCache([]);

			const [, value] = mockSet.mock.calls[0];
			expect(value.timestamp).toBeTruthy();
			expect(typeof value.timestamp).toBe('string');
		});

		it('should preserve data structure when caching', async () => {
			const friends: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: 'avatar-hash',
					status: 'confirmed',
					timezone: 'America/New_York',
					isOnline: false,
					isConnected: false,
				},
			];

			await saveFriendsCache(friends);

			const [, value] = mockSet.mock.calls[0];
			expect(value.data[0]).toEqual(friends[0]);
		});
	});

	describe('Store Configuration', () => {
		it('should use correct store file', async () => {
			const { load } = await import('@tauri-apps/plugin-store');

			await loadCachedFriends();

			expect(load).toHaveBeenCalledWith('cache.json', expect.any(Object));
		});

		it('should use autoSave for write operations', async () => {
			const { load } = await import('@tauri-apps/plugin-store');

			await saveFriendsCache([]);

			expect(load).toHaveBeenCalledWith('cache.json', {
				defaults: {},
				autoSave: 100,
			});
		});

		it('should not use autoSave for read operations', async () => {
			const { load } = await import('@tauri-apps/plugin-store');

			await loadCachedFriends();

			expect(load).toHaveBeenCalledWith('cache.json', {
				defaults: {},
				autoSave: false,
			});
		});
	});

	describe('Data Integrity', () => {
		it('should handle empty arrays correctly', async () => {
			await saveFriendsCache([]);

			const [, value] = mockSet.mock.calls[0];
			expect(value.data).toEqual([]);
		});

		it('should handle empty Map correctly', async () => {
			const emptyMap = new Map<string, GroupMember[]>();

			await saveGroupMembersCache(emptyMap);

			const [, value] = mockSet.mock.calls[0];
			expect(value.data).toEqual({});
		});

		it('should maintain group member permissions', async () => {
			const members = new Map<string, GroupMember[]>();
			members.set('group-1', [
				{
					id: 'member-1',
					groupId: 'group-1',
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'Admin',
					avatar: null,
					player: null,
					role: 'admin',
					canInvite: true,
					canRemoveMembers: true,
					canEditGroup: false,
					joinedAt: new Date().toISOString(),
				},
			]);

			await saveGroupMembersCache(members);

			const [, value] = mockSet.mock.calls[0];
			expect(value.data['group-1'][0].canInvite).toBe(true);
			expect(value.data['group-1'][0].canRemoveMembers).toBe(true);
			expect(value.data['group-1'][0].canEditGroup).toBe(false);
		});
	});
});
