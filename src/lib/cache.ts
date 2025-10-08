/**
 * Cache Module - Persistent caching for friends, groups, and group members
 *
 * Provides a simple caching layer using Tauri's plugin-store for offline support
 * and improved application startup performance. All cache operations fail silently
 * to ensure the app continues to work even if caching fails.
 *
 * @module cache
 * @example
 * ```ts
 * import { loadCachedFriends, saveFriendsCache } from '$lib/cache';
 *
 * // Load friends from cache
 * const friends = await loadCachedFriends();
 *
 * // Save friends to cache
 * await saveFriendsCache(friendsList);
 * ```
 */

import { load } from '@tauri-apps/plugin-store';
import type { Friend, Group, GroupMember } from '../types';

/** Store filename for cache data */
const CACHE_STORE = 'cache.json';

/**
 * Cache data structure with timestamp for cache invalidation
 * @template T - Type of data being cached
 */
interface CacheData<T> {
	/** The cached data */
	data: T;
	/** ISO 8601 timestamp when data was cached */
	timestamp: string;
}

/**
 * Load cached friends from persistent store
 *
 * Returns an empty array if cache is unavailable or corrupted.
 * This function never throws errors to ensure app stability.
 *
 * @returns Promise resolving to array of cached friends
 * @example
 * ```ts
 * const cachedFriends = await loadCachedFriends();
 * if (cachedFriends.length > 0) {
 *   console.log('Loaded', cachedFriends.length, 'friends from cache');
 * }
 * ```
 */
export async function loadCachedFriends(): Promise<Friend[]> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: false });
		const cached = await store.get<CacheData<Friend[]>>('friends_cache');
		return cached?.data || [];
	} catch {
		return [];
	}
}

/**
 * Save friends to persistent cache with automatic timestamping
 *
 * Stores friends list along with current timestamp for cache invalidation.
 * Fails silently if storage is unavailable to ensure app stability.
 *
 * @param friends - Array of friends to cache
 * @example
 * ```ts
 * await saveFriendsCache(activeFriends);
 * ```
 */
export async function saveFriendsCache(friends: Friend[]): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.set('friends_cache', {
			data: friends,
			timestamp: new Date().toISOString()
		});
	} catch {
		// Silently fail
	}
}

/**
 * Load cached groups from persistent store
 *
 * Returns an empty array if cache is unavailable or corrupted.
 * This function never throws errors to ensure app stability.
 *
 * @returns Promise resolving to array of cached groups
 * @example
 * ```ts
 * const cachedGroups = await loadCachedGroups();
 * ```
 */
export async function loadCachedGroups(): Promise<Group[]> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: false });
		const cached = await store.get<CacheData<Group[]>>('groups_cache');
		return cached?.data || [];
	} catch {
		return [];
	}
}

/**
 * Save groups to persistent cache with automatic timestamping
 *
 * Stores groups list along with current timestamp for cache invalidation.
 * Fails silently if storage is unavailable to ensure app stability.
 *
 * @param groups - Array of groups to cache
 * @example
 * ```ts
 * await saveGroupsCache(userGroups);
 * ```
 */
export async function saveGroupsCache(groups: Group[]): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.set('groups_cache', {
			data: groups,
			timestamp: new Date().toISOString()
		});
	} catch {
		// Silently fail
	}
}

/**
 * Load cached group members from persistent store
 *
 * Returns group members as a Map keyed by group ID. Returns an empty Map
 * if cache is unavailable or corrupted. This function never throws errors.
 *
 * @returns Promise resolving to Map of group ID to group members array
 * @example
 * ```ts
 * const groupMembers = await loadCachedGroupMembers();
 * const membersOfGroup = groupMembers.get('group-id-123') || [];
 * ```
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
	} catch {
		return new Map();
	}
}

/**
 * Save group members to persistent cache with automatic timestamping
 *
 * Converts Map to plain object for storage compatibility. Stores with current
 * timestamp for cache invalidation. Fails silently if storage is unavailable.
 *
 * @param groupMembers - Map of group ID to group members array
 * @example
 * ```ts
 * const groupMembers = new Map();
 * groupMembers.set('group-1', [member1, member2]);
 * await saveGroupMembersCache(groupMembers);
 * ```
 */
export async function saveGroupMembersCache(
	groupMembers: Map<string, GroupMember[]>
): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		// Convert Map to plain object for storage
		await store.set('group_members_cache', {
			data: Object.fromEntries(groupMembers),
			timestamp: new Date().toISOString()
		});
	} catch {
		// Silently fail
	}
}

/**
 * Clear all cached data from persistent store
 *
 * Removes all cache entries including friends, groups, and group members.
 * Useful when user logs out or wants to force a fresh data fetch.
 * Fails silently if storage is unavailable.
 *
 * @example
 * ```ts
 * // Clear cache on logout
 * await clearAllCache();
 * ```
 */
export async function clearAllCache(): Promise<void> {
	try {
		const store = await load(CACHE_STORE, { defaults: {}, autoSave: 100 });
		await store.clear();
	} catch {
		// Silently fail
	}
}
