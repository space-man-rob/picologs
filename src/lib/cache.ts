import { load } from '@tauri-apps/plugin-store';
import type { Friend, Group, GroupMember } from '../types';

const CACHE_STORE = 'cache.json';

interface CacheData<T> {
	data: T;
	timestamp: string;
}

/**
 * Load cached friends from store
 */
export async function loadCachedFriends(): Promise<Friend[]> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: false });
		const cached = await store.get<CacheData<Friend[]>>('friends_cache');
		return cached?.data || [];
	} catch (error) {
		return [];
	}
}

/**
 * Save friends to cache
 */
export async function saveFriendsCache(friends: Friend[]): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.set('friends_cache', {
			data: friends,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		// Silently fail
	}
}

/**
 * Load cached groups from store
 */
export async function loadCachedGroups(): Promise<Group[]> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: false });
		const cached = await store.get<CacheData<Group[]>>('groups_cache');
		return cached?.data || [];
	} catch (error) {
		return [];
	}
}

/**
 * Save groups to cache
 */
export async function saveGroupsCache(groups: Group[]): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.set('groups_cache', {
			data: groups,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		// Silently fail
	}
}

/**
 * Load cached group members from store
 */
export async function loadCachedGroupMembers(): Promise<Map<string, GroupMember[]>> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: false });
		const cached = await store.get<CacheData<Record<string, GroupMember[]>>>('group_members_cache');

		if (cached?.data) {
			// Convert object to Map
			return new Map(Object.entries(cached.data));
		}
		return new Map();
	} catch (error) {
		return new Map();
	}
}

/**
 * Save group members to cache
 */
export async function saveGroupMembersCache(groupMembers: Map<string, GroupMember[]>): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		// Convert Map to plain object for storage
		await store.set('group_members_cache', {
			data: Object.fromEntries(groupMembers),
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		// Silently fail
	}
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.clear();
	} catch (error) {
		// Silently fail
	}
}
