/**
 * Tests for merge utilities
 * Tests smart merging of friends, groups, and group members
 */

import { describe, it, expect } from 'vitest';
import {
	mergeFriends,
	mergeGroups,
	mergeGroupMembers,
	friendsHaveChanged,
	groupsHaveChanged
} from './merge';
import type { Friend, Group, GroupMember } from '../types';

describe('Merge Utilities', () => {
	describe('mergeFriends', () => {
		it('should merge empty arrays', () => {
			const existing: Friend[] = [];
			const fresh: Friend[] = [];

			const result = mergeFriends(existing, fresh);

			expect(result).toEqual([]);
		});

		it('should add new friends from fresh data', () => {
			const existing: Friend[] = [];
			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'NewFriend',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = mergeFriends(existing, fresh);

			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('friend-1');
			expect(result[0].name).toBe('NewFriend');
		});

		it('should update existing friends with fresh data', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'OldName',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: false,
					isConnected: false
				}
			];

			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'UpdatedName',
					avatar: 'new-avatar',
					status: 'confirmed',
					timezone: 'America/New_York',
					isOnline: true,
					isConnected: true
				}
			];

			const result = mergeFriends(existing, fresh);

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('UpdatedName');
			expect(result[0].avatar).toBe('new-avatar');
			expect(result[0].isOnline).toBe(true);
		});

		it('should preserve existing friends not in fresh data', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				},
				{
					id: 'friend-2',
					discordId: 'discord-2',
					friendCode: 'DEF456',
					name: 'Friend2',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: false,
					isConnected: false
				}
			];

			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'UpdatedFriend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = mergeFriends(existing, fresh);

			expect(result).toHaveLength(2);
			expect(result.find((f) => f.id === 'friend-1')?.name).toBe('UpdatedFriend1');
			expect(result.find((f) => f.id === 'friend-2')?.name).toBe('Friend2');
		});

		it('should handle multiple new and updated friends', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: false,
					isConnected: false
				}
			];

			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				},
				{
					id: 'friend-2',
					discordId: 'discord-2',
					friendCode: 'DEF456',
					name: 'Friend2',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = mergeFriends(existing, fresh);

			expect(result).toHaveLength(2);
			expect(result.find((f) => f.id === 'friend-1')?.isOnline).toBe(true);
			expect(result.find((f) => f.id === 'friend-2')).toBeTruthy();
		});
	});

	describe('mergeGroups', () => {
		it('should merge empty arrays', () => {
			const existing: Group[] = [];
			const fresh: Group[] = [];

			const result = mergeGroups(existing, fresh);

			expect(result).toEqual([]);
		});

		it('should add new groups from fresh data', () => {
			const existing: Group[] = [];
			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'New Group',
					description: 'Test group',
					avatar: undefined,
					tags: ['test'],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = mergeGroups(existing, fresh);

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('New Group');
		});

		it('should update existing groups with fresh data', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'Old Name',
					description: 'Old description',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'Updated Name',
					description: 'Updated description',
					avatar: 'new-avatar',
					tags: ['updated'],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = mergeGroups(existing, fresh);

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('Updated Name');
			expect(result[0].description).toBe('Updated description');
			expect(result[0].avatar).toBe('new-avatar');
			expect(result[0].tags).toEqual(['updated']);
		});

		it('should preserve existing groups not in fresh data', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'Group 1',
					description: 'Desc 1',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				},
				{
					id: 'group-2',
					name: 'Group 2',
					description: 'Desc 2',
					avatar: undefined,
					tags: [],
					ownerId: 'user-2',
					memberRole: 'owner',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'Updated Group 1',
					description: 'Desc 1',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = mergeGroups(existing, fresh);

			expect(result).toHaveLength(2);
			expect(result.find((g) => g.id === 'group-1')?.name).toBe('Updated Group 1');
			expect(result.find((g) => g.id === 'group-2')?.name).toBe('Group 2');
		});
	});

	describe('mergeGroupMembers', () => {
		it('should merge empty maps', () => {
			const existing = new Map<string, GroupMember[]>();
			const fresh = new Map<string, GroupMember[]>();

			const result = mergeGroupMembers(existing, fresh);

			expect(result.size).toBe(0);
		});

		it('should add new group members from fresh data', () => {
			const existing = new Map<string, GroupMember[]>();
			const fresh = new Map<string, GroupMember[]>();

			fresh.set('group-1', [
				{
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'User1',
					avatar: undefined,
					player: undefined,
					role: 'member'
				}
			]);

			const result = mergeGroupMembers(existing, fresh);

			expect(result.size).toBe(1);
			expect(result.get('group-1')).toHaveLength(1);
			expect(result.get('group-1')?.[0].username).toBe('User1');
		});

		it('should update existing group members', () => {
			const existing = new Map<string, GroupMember[]>();
			existing.set('group-1', [
				{
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'OldName',
					avatar: undefined,
					player: undefined,
					role: 'member'
				}
			]);

			const fresh = new Map<string, GroupMember[]>();
			fresh.set('group-1', [
				{
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'NewName',
					avatar: 'avatar',
					player: 'Player1',
					role: 'admin'
				}
			]);

			const result = mergeGroupMembers(existing, fresh);

			expect(result.size).toBe(1);
			expect(result.get('group-1')?.[0].username).toBe('NewName');
			expect(result.get('group-1')?.[0].role).toBe('admin');
		});

		it('should preserve existing groups not in fresh data', () => {
			const existing = new Map<string, GroupMember[]>();
			existing.set('group-1', [
				{
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'User1',
					avatar: undefined,
					player: undefined,
					role: 'member'
				}
			]);
			existing.set('group-2', [
				{
					userId: 'user-2',
					discordId: 'discord-2',
					username: 'User2',
					avatar: undefined,
					player: undefined,
					role: 'owner'
				}
			]);

			const fresh = new Map<string, GroupMember[]>();
			fresh.set('group-1', [
				{
					userId: 'user-1',
					discordId: 'discord-1',
					username: 'UpdatedUser1',
					avatar: undefined,
					player: undefined,
					role: 'admin'
				}
			]);

			const result = mergeGroupMembers(existing, fresh);

			expect(result.size).toBe(2);
			expect(result.get('group-1')?.[0].username).toBe('UpdatedUser1');
			expect(result.get('group-2')?.[0].username).toBe('User2');
		});
	});

	describe('friendsHaveChanged', () => {
		it('should return false for identical empty arrays', () => {
			const existing: Friend[] = [];
			const fresh: Friend[] = [];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(false);
		});

		it('should return true for different lengths', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];
			const fresh: Friend[] = [];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true for different friend IDs', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];
			const fresh: Friend[] = [
				{
					id: 'friend-2',
					discordId: 'discord-2',
					friendCode: 'DEF456',
					name: 'Friend2',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true when online status changes', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: false,
					isConnected: false
				}
			];
			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true when name changes', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'OldName',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];
			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'NewName',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true when connection status changes', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: false
				}
			];
			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return false when no relevant fields changed', () => {
			const existing: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];
			const fresh: Friend[] = [
				{
					id: 'friend-1',
					discordId: 'discord-1',
					friendCode: 'ABC123',
					name: 'Friend1',
					avatar: undefined,
					status: 'confirmed',
					timezone: 'UTC',
					isOnline: true,
					isConnected: true
				}
			];

			const result = friendsHaveChanged(existing, fresh);

			expect(result).toBe(false);
		});
	});

	describe('groupsHaveChanged', () => {
		it('should return false for identical empty arrays', () => {
			const existing: Group[] = [];
			const fresh: Group[] = [];

			const result = groupsHaveChanged(existing, fresh);

			expect(result).toBe(false);
		});

		it('should return true for different lengths', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'Group1',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];
			const fresh: Group[] = [];

			const result = groupsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true when group name changes', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'OldName',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];
			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'NewName',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = groupsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return true when avatar changes', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'Group1',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];
			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'Group1',
					description: 'Desc',
					avatar: 'new-avatar',
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = groupsHaveChanged(existing, fresh);

			expect(result).toBe(true);
		});

		it('should return false when no relevant fields changed', () => {
			const existing: Group[] = [
				{
					id: 'group-1',
					name: 'Group1',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];
			const fresh: Group[] = [
				{
					id: 'group-1',
					name: 'Group1',
					description: 'Desc',
					avatar: undefined,
					tags: [],
					ownerId: 'user-1',
					memberRole: 'member',
					memberCount: 1,
					createdAt: '2024-01-01T00:00:00Z'
				}
			];

			const result = groupsHaveChanged(existing, fresh);

			expect(result).toBe(false);
		});
	});
});
